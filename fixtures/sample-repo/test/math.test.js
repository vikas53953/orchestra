'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { add, subtract } = require('../src/math');
const { celsiusToFahrenheit } = require('../src/convert');

test('add', () => {
  assert.strictEqual(add(2, 3), 5);
});

test('subtract', () => {
  assert.strictEqual(subtract(5, 3), 2);
});

test('celsiusToFahrenheit', () => {
  assert.strictEqual(celsiusToFahrenheit(100), 212);
});
