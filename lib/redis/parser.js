'use strict';

var _ = require('lodash');
var Command = require('../command');
var SubscriptionSet = require('../subscription_set');
var SubserviceSet = require('../subservice_set');
var debug = require('debug')('ioredis:reply');

/**
 * Init the parser
 *
 * @method _initParser
 * @memberOf Redis#
 * @private
 */
exports.initParser = function () {
  var self = this;

  this.replyParser = new this.Parser();

  // "reply error" is an error sent back by Redis
  this.replyParser.sendError = function (reply) {
    self.returnError(reply);
  };
  this.replyParser.sendReply = function (reply) {
    self.returnReply(reply);
  };
  this.replyParser.sendFatalError = function (err) {
    self.emit('error', new Error('Redis reply parser error: ' + err.stack));
  };
};

exports.returnError = function (err) {
  var item = this.commandQueue.shift();

  err.command = {
    name: item.command.name,
    args: item.command.args
  };

  var needReconnect = false;
  if (this.options.reconnectOnError) {
    needReconnect = this.options.reconnectOnError(err);
  }

  switch (needReconnect) {
    case 1:
    case true:
      if (this.status !== 'reconnecting') {
        this.disconnect(true);
      }
      item.command.reject(err);
      break;
    case 2:
      if (this.status !== 'reconnecting') {
        this.disconnect(true);
      }
      if (this.condition.select !== item.select && item.command.name !== 'select') {
        this.select(item.select);
      }
      this.sendCommand(item.command);
      break;
    default:
      item.command.reject(err);
  }
};
/*
var sharedBuffers = {};
_.forEach(['message', 'pmessage', 'subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe'], function (str) {
  sharedBuffers[str] = new Buffer(str);
});
*/
exports.returnReply = function (reply) {
    //console.log("{:", this.commandQueue.length);
    if (this.status === 'monitoring') {
    // Valid commands in the monitoring mode are AUTH and MONITOR,
    // both of which always reply with 'OK'.
    var replyStr = reply.toString();

    // If not the reply to AUTH & MONITOR
    if (replyStr !== 'OK') {
      // Since commands sent in the monitoring mode will trigger an exception,
      // any replies we received in the monitoring mode should consider to be
      // realtime monitor data instead of result of commands.
      var len = replyStr.indexOf(' ');
      var timestamp = replyStr.slice(0, len);
      var argindex = replyStr.indexOf('"');
      var args = replyStr.slice(argindex + 1, -1).split('" "').map(function (elem) {
        return elem.replace(/\\"/g, '"');
      });
      this.emit('monitor', timestamp, args);
      return;
    }
  }

  var item, channel, count;
  if (this.condition.subscriber) {
    //console.log('receive reply in subservice mode', reply);
    var replyType = Array.isArray(reply) ? reply[0].toString() : null;
    debug('receive reply "%s" in subscriber mode', replyType);
    switch (replyType) {
    case 'message':
      if (this.listeners('message').length > 0) {
        this.emit('message', reply[1].toString(), reply[2].toString());
      }
      if (this.listeners('messageBuffer').length > 0) {
        this.emit('messageBuffer', reply[1], reply[2]);
      }
      return;
    case 'pmessage':
      var pattern = reply[1].toString();
      if (this.listeners('pmessage').length > 0) {
        this.emit('pmessage', pattern, reply[2].toString(), reply[3].toString());
      }
      if (this.listeners('pmessageBuffer').length > 0) {
        this.emit('pmessageBuffer', pattern, reply[2], reply[3]);
      }
      return;
    case 'subscribe':
    case 'psubscribe':
      channel = reply[1].toString();
      this.condition.subscriber.add(replyType, channel);
      item = this.commandQueue.shift();
      if (!fillSubCommand(item.command, reply[2])) {
        this.commandQueue.unshift(item);
      }
      return;
    case 'unsubscribe':
    case 'punsubscribe':
      channel = reply[1] ? reply[1].toString() : null;
      if (channel) {
        this.condition.subscriber.del(replyType, channel);
      }
      count = reply[2];
      if (count === 0) {
        this.condition.subscriber = false;
      }
      item = this.commandQueue.shift();
      if (!fillUnsubCommand(item.command, count)) {
        this.commandQueue.unshift(item);
      }
      return;
/*    default:
        item = this.commandQueue.shift();
        item.command.resolve(reply);
        break;*/
    }
  }
  var key;
  //console.log("{:", this.commandQueue.length);
  if (this.condition.subservice) {
     // console.log('receive reply in subservice mode', reply[0].toString(),reply[1] ? reply[1].toString() : "null");
      var replyType = Array.isArray(reply) ? reply[0].toString() : null;
      debug('receive reply "%s" in subscriber mode', replyType);
      switch (replyType) {
          case 'subservice':
          case 'psubservice':
              channel = reply[1].toString();
              this.condition.subservice.add(replyType, channel);
              item = this.commandQueue.shift();
              item.command.resolve(1);
              //console.log("item:",item)
              return;
          case 'unsubservice':
          case 'punsubservice':
              channel = reply[1] ? reply[1].toString() : null;
              if (channel) {
                  this.condition.subservice.del(replyType, channel);
              }
              if (this.condition.subservice.isEmpty()) {
                  this.condition.subservice = false;
              }
              item = this.commandQueue.shift();
              item.command.resolve(0);
              return;
          case 'ungetservice':
              //console.log(this.condition.subservice.channels(replyType));
             // console.log(this.listeners(reply[1].toString()).length, reply[0].toString(), reply[1] ? reply[1].toString() : "null", reply[1] ? reply[2].toString() : "null", reply[3] ? reply[3].toString() : "null");
              channel = reply[1] ? reply[1].toString() : null;
              key = reply[2] ? reply[2].toString() : null;
              if (channel&&key) {
                  item = this.condition.subservice.del(replyType, channel+":"+key);
              }
              if (this.condition.subservice.isEmpty()) {
                  this.condition.subservice = false;
              }
              //console.log(this.condition.subservice.channels(replyType));
              if (this.listeners(reply[1].toString()).length > 0) {
                  this.emit.apply(this, reply.slice(1));
              }
              return;
          case 'pubservice':
             // console.log(this.listeners(reply[1].toString()).length, reply[0].toString(), reply[1] ? reply[1].toString() : "null", reply[1] ? reply[2].toString() : "null", reply[1] ? reply[3].toString() : "null");
              if (this.listeners(reply[1].toString()).length > 0)
              {
                  this.emit.apply(this, reply.slice(1));
              }
              return;
      }
  }
  if (!this.condition.subscriber && !this.condition.subservice)
  {
    item = this.commandQueue.shift();
    if (!item) {
        return this.emit('error', new Error('Command queue state error. If you can reproduce this, please report it.' + reply.toString()));
    }
    //console.log(" ::", item.command.name,item.command.args[1]);
    if (_.includes(Command.FLAGS.ENTER_SUBSCRIBER_MODE, item.command.name)) {
        if (!this.condition.subscriber) {
            this.condition.subscriber = new SubscriptionSet();
        }
        this.condition.subscriber.add(item.command.name, reply[1].toString());
        if (!fillSubCommand(item.command, reply[2])) {
            this.commandQueue.unshift(item);
        }
    } else if (_.includes(Command.FLAGS.EXIT_SUBSCRIBER_MODE, item.command.name)) {
      if (!fillUnsubCommand(item.command, reply[2])) {
        this.commandQueue.unshift(item);
      }
    } else if (_.includes(Command.FLAGS.ENTER_SUBSERVICE_MODE, item.command.name)) {
        if(!this.condition.subservice){
            this.condition.subservice = new SubserviceSet();
        } 
        this.condition.subservice.add(item.command.name, reply[1].toString());
        item.command.resolve(1);
    } else if (_.includes(Command.FLAGS.ENTER_GETSERVICE_MODE, item.command.name)) {
        //必须先收到get数据后才继续接收订阅信息，可能会堵塞
        if(!this.condition.subservice){
            this.condition.subservice = new SubserviceSet();
        }
        //console.log("   :::", item.command.args[0], item.command.args[1]);
        //this.condition.subservice.addcommand(item.command.name, item);
        this.condition.subservice.add(item.command.name, item.command.args[0] + ":" + item.command.args[1]);
        item.command.resolve(reply);
    } else {
      item.command.resolve(reply);
    }
    //console.log("}:", this.commandQueue.length);
  }

  function fillSubCommand(command, count) {
      //用来处理一个命令带多个key订阅的情况，如果没有处理完成，就把shift出来的记录unshift回去，
      //如果到了最后的key，就直接resolve
    if (typeof command.remainReplies === 'undefined') {
      command.remainReplies = command.args.length; 
    }
    if (--command.remainReplies === 0) {
        command.resolve(count);
      return true;
    }
    return false;
  }

  function fillUnsubCommand(command, count) {
    if (typeof command.remainReplies === 'undefined') {
      command.remainReplies = command.args.length;
    }
    if (command.remainReplies === 0) {
      if (count === 0) {
        command.resolve(reply[2]);
        return true;
      }
      return false;
    }
    if (--command.remainReplies === 0) {
      command.resolve(reply[2]);
      return true;
    }
    return false;
  }
};
