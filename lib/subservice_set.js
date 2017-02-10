'use strict';

/**
 * Tiny class to simplify dealing with subscription set
 *
 * @constructor
 * @private
 */

function SubserviceSet() {
    this.set = {
        subservice: {},
        psubservice: {},
    };
}

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
    return this.channels('subservice').length === 0 && this.channels('psubservice').length === 0 ;
};

function mapSet(set) {
    if (set === 'unsubservice') {
        return 'subservice';
    }
    if (set === 'punsubservice') {
        return 'psubservice';
    }
    return set;
}

module.exports = SubserviceSet;
