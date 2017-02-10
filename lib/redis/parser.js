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

    var item, channel, count ,key;
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
            break;
        case 'pmessage':
            var pattern = reply[1].toString();
            if (this.listeners('pmessage').length > 0) {
                this.emit('pmessage', pattern, reply[2].toString(), reply[3].toString());
            }
            if (this.listeners('pmessageBuffer').length > 0) {
                this.emit('pmessageBuffer', pattern, reply[2], reply[3]);
            }
            break;
        case 'subscribe':
        case 'psubscribe':
            if (!this.condition.subscriber) {
                this.condition.subscriber = new SubscriptionSet();
            }
            item = this.commandQueue.shift();
            if (!item) {
                return this.emit('error', new Error('Command state error:' + reply.toString()));
            }
            this.condition.subscriber.add(item.command.name, reply[1].toString());
            if (!fillSubCommand(item.command, reply[2])) {
                this.commandQueue.unshift(item);
            }
            break;
        case 'unsubscribe':
        case 'punsubscribe':
            if (this.condition.subscriber) {
                channel = reply[1] ? reply[1].toString() : null;
                if (channel) {
                    this.condition.subscriber.del(replyType, channel);
                }
                count = reply[2];
                if (count === 0) {
                    this.condition.subscriber = false;
                }
            }
            item = this.commandQueue.shift();
            if (!item) {
                return this.emit('error', new Error('Command state error:' + reply.toString()));
            }
            if (!fillUnsubCommand(item.command, count)) {
                this.commandQueue.unshift(item);
            }
            break;
            ////////////////////////////////////////////////////////////////
        case 'subservice':
        case 'psubservice':
            if (!this.condition.subservice) {
                this.condition.subservice = new SubserviceSet();
            }
            item = this.commandQueue.shift();
            if (!item) {
                return this.emit('error', new Error('Command state error:' + reply.toString()));
            }
            this.condition.subservice.add(item.command.name, reply[1].toString());
            item.command.resolve(1);
            break;
        case 'unsubservice':
        case 'punsubservice':
            if (!this.condition.subservice) {
                channel = reply[1] ? reply[1].toString() : null;
                if (channel) {
                    this.condition.subservice.del(replyType, channel);
                }
                if (this.condition.subservice.isEmpty()) {
                    this.condition.subservice = false;
                }
            }
            item = this.commandQueue.shift();
            if (!item) {
                return this.emit('error', new Error('Command state error:' + reply.toString()));
            }
            item.command.resolve(0);
            break;
        case 'ungetservice':
            //console.log(this.condition.getservice);
            //console.log(this.listeners(reply[1].toString()).length, reply[0].toString(), reply[1] ? reply[1].toString() : "null", reply[1] ? reply[2].toString() : "null", reply[3] ? reply[3].toString() : "null");
            channel = reply[1] ? reply[1].toString() : null;
            key     = reply[2] ? reply[2].toString() : null;
            item = findcommand(this.condition.getservice,channel, key);
            //item.command.resolve(reply); //正确的处理方式应该是这样，但是牵涉到很多问题，暂时用callback直接调用的方式
            //console.log(item);
            if (item) {
                item.command.cl_resolve(reply.slice(3));
            }
            break;
        case 'pubservice':
            // console.log(this.listeners(reply[1].toString()).length, reply[0].toString(), reply[1] ? reply[1].toString() : "null", reply[1] ? reply[2].toString() : "null", reply[1] ? reply[3].toString() : "null");
            if (this.listeners(reply[1].toString()).length > 0) {
                this.emit.apply(this, reply.slice(1));
            }
            break;
        default:
            item = this.commandQueue.shift();
            if (!item) {
                return this.emit('error', new Error('Command state error:' + reply.toString()));
            }
            switch (item.command.name) {
                case 'getservice':
                    if (!item) {
                        return this.emit('error', new Error('Command state error:' + reply.toString()));
                    }
                    addcommand(this.condition.getservice, item);
                    break;
            }
            item.command.resolve(reply);
            break;
    }
    //console.log("}:", this.commandQueue.length);

    function addcommand(services, command) {
        //console.log("push:", services.length);
        services.push(command);
    };

  function findcommand(services, name, key) {
      var item = null;
      //console.log("find:", services.length);
      for (var i = 0; i < services.length; i++) {
          if (services[i].command.args[0] == name &&
             services[i].command.args[1] == key) {
              item = services[i];
              //console.log("del:", i, services.length);
              services.splice(i, 1);
              break;
          }
      }
      return item;
  };

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
