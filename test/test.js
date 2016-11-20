/* global describe, it */
var fs = require('fs')
var path = require('path')
var cldiffutils = require('../cldiffutils')
require('should')

var before = {
  text: fs.readFileSync(path.join(__dirname, 'before.md'), 'utf8'),
  discussions: {},
  comments: {},
  properties: {}
}
var after = {
  text: fs.readFileSync(path.join(__dirname, 'after.md'), 'utf8'),
  discussions: {},
  comments: {},
  properties: {}
}

describe('Content changes', function () {
  it('should work properly', function () {
    var change = cldiffutils.makeContentChange(before, after)
    var result = cldiffutils.applyContentChanges(before, [change])
    result.should.have.property('text').equal(after.text)
  })
  it('should work properly in reverse', function () {
    var change = cldiffutils.makeContentChange(before, after)
    var result = cldiffutils.applyContentChanges(after, [change], true)
    result.should.have.property('text').equal(before.text)
  })
})
