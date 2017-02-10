'use strict';

/**
 * Tiny class to simplify dealing with subscription set
 *
 * @constructor
 * @private
 */

function SubserviceSet() {
    this.set = {
        //getservice: [],
        getservice: {},
        subservice: {},
        psubservice: {},
    };
}
/*
SubserviceSet.prototype.addcommand = function (set, command) {
    this.set[mapSet(set)].push(command);
};

SubserviceSet.prototype.findcommand = function (set, service, key) {
    var item = null;
    for (var i = 0; i < this.set[mapSet(set)].length; i++) {
        if (this.set[mapSet(set)][i].command.args[0] == service &&
           this.set[mapSet(set)][i].command.args[1] == key)
            item = this.set[mapSet(set)][i];
            this.set[mapSet(set)].splice(i, 1);
            break;
           // return this.set[mapSet(set)][i];
    }
    return item;
};
*/
SubserviceSet.prototype.add = function (set, service) {
    this.set[mapSet(set)][service] = true;
};

SubserviceSet.prototype.del = function (set, service) {
    delete this.set[mapSet(set)][service];
};

SubserviceSet.prototype.channels = function (set) {
    return Object.keys(this.set[mapSet(set)]);
};

SubserviceSet.prototype.isEmpty = function () {
    return this.channels('subservice').length === 0 && this.channels('psubservice').length === 0 && this.channels('getservice').length === 0;
};

function mapSet(set) {
    if (set === 'unsubservice') {
        return 'subservice';
    }
    if (set === 'punsubservice') {
        return 'psubservice';
    }
    if (set === 'ungetservice') {
        return 'getservice';
    }
    return set;
}

module.exports = SubserviceSet;
