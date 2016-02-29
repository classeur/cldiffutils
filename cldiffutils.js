;(function (root, factory) {
  if (typeof exports === 'object') {
    require('clunderscore')
    module.exports = factory(require('googlediff'))
  } else {
    root.clDiffUtils = factory(root.diff_match_patch)
  }
})(this, function (diff_match_patch) {
  var clDiffUtils = {}
  var marker = '\uF111\uF222\uF333\uF444'
  var DIFF_DELETE = -1
  var DIFF_INSERT = 1
  var DIFF_EQUAL = 0
  var diffMatchPatch = new diff_match_patch() // eslint-disable-line new-cap
  var diffMatchPatchStrict = new diff_match_patch() // eslint-disable-line new-cap
  diffMatchPatchStrict.Match_Threshold = 0
  diffMatchPatchStrict.Patch_DeleteThreshold = 0
  var diffMatchPatchPermissive = new diff_match_patch() // eslint-disable-line new-cap
  diffMatchPatchPermissive.Match_Distance = 999999999

  function offsetToPatch (text, offset) {
    var patch = diffMatchPatchPermissive.patch_make(text, [
      [0, text.slice(0, offset)],
      [1, marker],
      [0, text.slice(offset)]
    ])[0]
    var diffs = patch.diffs.cl_map(function (diff) {
      if (!diff[0]) {
        return diff[1]
      } else if (diff[1] === marker) {
        return ''
      }
    })
    return {
      diffs: diffs,
      length: patch.length1,
      start: patch.start1
    }
  }

  function patchToOffset (text, patch) {
    var markersLength = 0
    var diffs = patch.diffs.cl_map(function (diff) {
      if (!diff) {
        markersLength += marker.length
        return [1, marker]
      } else {
        return [0, diff]
      }
    })
    return diffMatchPatchPermissive.patch_apply([{
      diffs: diffs,
      length1: patch.length,
      length2: patch.length + markersLength,
      start1: patch.start,
      start2: patch.start
    }], text)[0].indexOf(marker)
  }

  function flattenObject (obj) {
    return obj.cl_reduce(function (result, value, key) {
      result[key] = value[1]
      return result
    }, {})
  }

  function flattenContent (content, doChars) {
    return ({}).cl_extend(content).cl_extend({
      text: content.text.cl_map(function (item) {
        return item[1]
      }).join(''),
      chars: doChars && content.text
          .cl_reduce(function (chars, item) {
            return chars.concat(item[1].split('').cl_map(function (c) {
              return [item[0], c]
            }))
          }, []),
      properties: flattenObject(content.properties),
      discussions: flattenObject(content.discussions),
      comments: flattenObject(content.comments),
      conflicts: flattenObject(content.conflicts)
    })
  }

  function applyFlattenedObjectPatches (obj, patches) {
    patches && patches.cl_each(function (patch) {
      if (patch.a) {
        obj[patch.k] = patch.a
      } else if (patch.d) {
        delete obj[patch.k]
      }
    })
  }

  function applyFlattenedObjectPatchesReverse (obj, patches) {
    patches && patches.slice().reverse().cl_each(function (patch) {
      if (patch.d) {
        obj[patch.k] = patch.d
      } else if (patch.a) {
        delete obj[patch.k]
      }
    })
  }

  function applyFlattenedTextPatches (text, patches) {
    return (patches || []).cl_reduce(function (text, patch) {
      if (patch.a) {
        return text.slice(0, patch.o).concat(patch.a).concat(text.slice(patch.o))
      } else if (patch.d) {
        return text.slice(0, patch.o).concat(text.slice(patch.o + patch.d.length))
      } else {
        return text
      }
    }, text)
  }

  function applyFlattenedTextPatchesReverse (text, patches) {
    return (patches || []).slice().reverse().cl_reduce(function (text, patch) {
      if (patch.d) {
        return text.slice(0, patch.o).concat(patch.d).concat(text.slice(patch.o))
      } else if (patch.a) {
        return text.slice(0, patch.o).concat(text.slice(patch.o + patch.a.length))
      } else {
        return text
      }
    }, text)
  }

  function applyCharPatches (chars, patches, userId) {
    return (patches || []).cl_reduce(function (chars, patch) {
      if (patch.a) {
        return chars.slice(0, patch.o).concat(patch.a.split('').cl_map(function (c) {
          return [userId, c]
        })).concat(chars.slice(patch.o))
      } else if (patch.d) {
        return chars.slice(0, patch.o).concat(chars.slice(patch.o + patch.d.length))
      } else {
        return chars
      }
    }, chars)
  }

  function applyFlattenedContentChanges (content, contentChanges, doChars) {
    var userId
    var properties = ({}).cl_extend(content.properties)
    var discussions = ({}).cl_extend(content.discussions)
    var comments = ({}).cl_extend(content.comments)
    var conflicts = ({}).cl_extend(content.conflicts)
    var text = content.text
    var chars = doChars && content.chars.slice()
    contentChanges = contentChanges || []
    contentChanges.cl_each(function (contentChange) {
      applyFlattenedObjectPatches(properties, contentChange.properties)
      applyFlattenedObjectPatches(discussions, contentChange.discussions)
      applyFlattenedObjectPatches(comments, contentChange.comments)
      applyFlattenedObjectPatches(conflicts, contentChange.conflicts)
      text = applyFlattenedTextPatches(text, contentChange.text)
      if (doChars) {
        userId = contentChange.userId || userId
        chars = applyCharPatches(chars, contentChange.text, userId)
      }
    })
    return {
      chars: chars,
      text: text,
      properties: properties,
      discussions: discussions,
      comments: comments,
      conflicts: conflicts,
      rev: content.rev + contentChanges.length
    }
  }

  function getTextPatches (oldText, newText) {
    var diffs = diffMatchPatch.diff_main(oldText, newText)
    diffMatchPatch.diff_cleanupEfficiency(diffs)
    var patches = []
    var startOffset = 0
    diffs.cl_each(function (change) {
      var changeType = change[0]
      var changeText = change[1]
      switch (changeType) {
        case DIFF_EQUAL:
          startOffset += changeText.length
          break
        case DIFF_DELETE:
          changeText && patches.push({
            o: startOffset,
            d: changeText
          })
          break
        case DIFF_INSERT:
          changeText && patches.push({
            o: startOffset,
            a: changeText
          })
          startOffset += changeText.length
          break
      }
    })
    return patches.length ? patches : undefined
  }

  function getObjectPatches (oldObject, newObjects) {
    var valueHash = Object.create(null)
    var valueArray = []
    oldObject = hashObject(oldObject, valueHash, valueArray)
    newObjects = hashObject(newObjects, valueHash, valueArray)
    var diffs = diffMatchPatch.diff_main(oldObject, newObjects)
    var patches = []
    diffs.cl_each(function (change) {
      var changeType = change[0]
      var changeHash = change[1]
      if (changeType === DIFF_EQUAL) {
        return
      }
      changeHash.split('').cl_each(function (objHash) {
        var obj = valueArray[objHash.charCodeAt(0)]
        var patch = {
          k: obj[0]
        }
        patch[changeType === DIFF_DELETE ? 'd' : 'a'] = obj[1]
        patches.push(patch)
      })
    })
    return patches.length ? patches : undefined
  }

  function serializeObject (obj) {
    return JSON.stringify(obj, function (key, value) {
      return Object.prototype.toString.call(value) === '[object Object]'
        ? Object.keys(value).sort().cl_reduce(function (sorted, key) {
          sorted[key] = value[key]
          return sorted
        }, {})
        : value
    })
  }

  function hashArray (arr, valueHash, valueArray) {
    var hash = []
    arr.cl_each(function (obj) {
      var serializedObj = serializeObject(obj)
      var objHash = valueHash[serializedObj]
      if (objHash === undefined) {
        objHash = valueArray.length
        valueArray.push(obj)
        valueHash[serializedObj] = objHash
      }
      hash.push(objHash)
    })
    return String.fromCharCode.apply(null, hash)
  }

  function hashObject (obj, valueHash, valueArray) {
    return hashArray(Object.keys(obj || {}).sort().cl_map(function (key) {
      return [key, obj[key]]
    }), valueHash, valueArray)
  }

  function unhashArray (hash, valueArray) {
    return hash.split('').cl_map(function (objHash) {
      return valueArray[objHash.charCodeAt(0)]
    })
  }

  function mergeText (oldText, newText, serverText) {
    var valueHash = Object.create(null)
    var valueArray = []
    var oldHash = hashArray(oldText.split('\n'), valueHash, valueArray)
    var newHash = hashArray(serverText.split('\n'), valueHash, valueArray)
    var serverHash = hashArray(newText.split('\n'), valueHash, valueArray)
    var diffs = diffMatchPatchStrict.diff_main(oldHash, newHash)
    var patches = diffMatchPatchStrict.patch_make(oldHash, diffs)
    var patchResult = diffMatchPatchStrict.patch_apply(patches, serverHash)
    if (!patchResult[1]
        .cl_some(function (changeApplied) {
          return !changeApplied
        })) {
      return [unhashArray(patchResult[0], valueArray).join('\n'), []]
    }
    var conflicts = []
    var conflict = {}
    var lastType
    var resultHash = ''
    diffs = diffMatchPatchStrict.diff_main(patchResult[0], newHash)
    diffs.cl_each(function (diff) {
      var diffType = diff[0]
      var diffText = diff[1]
      resultHash += diffText
      if (diffType !== lastType) {
        if (conflict.offset3) {
          conflicts.push(conflict)
          conflict = {}
        }
        if (conflict.offset2) {
          if (diffType === DIFF_EQUAL) {
            conflict = {}
          } else {
            conflict.offset3 = resultHash.length
          }
        } else if (diffType !== DIFF_EQUAL) {
          conflict.offset1 = resultHash.length - diffText.length
          conflict.offset2 = resultHash.length
        }
      }
      lastType = diffType
    })
    conflict.offset3 && conflicts.push(conflict)
    var resultLines = unhashArray(resultHash, valueArray)
    var resultStr = resultLines.join('\n')
    var lastOffset = 0
    var resultLineOffsets = resultLines.cl_map(function (resultLine) {
      var result = lastOffset
      lastOffset += resultLine.length + 1
      return result
    })
    return [resultStr, conflicts.cl_map(function (conflict) {
      return {
        patches: [
          offsetToPatch(resultStr, resultLineOffsets[conflict.offset1]),
          offsetToPatch(resultStr, resultLineOffsets[conflict.offset2]),
          offsetToPatch(resultStr, resultLineOffsets[conflict.offset3])
        ]
      }
    })]
  }

  function quickPatch (oldStr, newStr, destStr, strict) {
    var dmp = strict ? diffMatchPatchStrict : diffMatchPatch
    var diffs = dmp.diff_main(oldStr, newStr)
    var patches = dmp.patch_make(oldStr, diffs)
    var patchResult = dmp.patch_apply(patches, destStr)
    return patchResult[0]
  }

  function mergeObjects (oldObject, newObject, serverObject) {
    var mergedObject = ({}).cl_extend(newObject).cl_extend(serverObject)
    mergedObject.cl_each(function (value, key) {
      if (!oldObject[key]) {
        return // There might be conflict, keep the server value
      }
      var newValue = newObject[key] && serializeObject(newObject[key])
      var serverValue = serverObject[key] && serializeObject(serverObject[key])
      if (newValue === serverValue) {
        return // no conflict
      }
      var oldValue = serializeObject(oldObject[key])
      if (oldValue !== newValue && !serverValue) {
        return // Removed on server but changed on client
      }
      if (oldValue !== serverValue && !newValue) {
        return // Removed on client but changed on server
      }
      if (oldValue !== newValue && oldValue === serverValue) {
        // Take the client value
        if (!newValue) {
          delete mergedObject[key]
        } else {
          mergedObject[key] = newObject[key]
        }
      } else if (oldValue !== serverValue && oldValue === newValue) {
        // Take the server value
        if (!serverValue) {
          delete mergedObject[key]
        }
      }
    // Take the server value otherwise
    })
    return mergedObject
  }

  function mergeContent (oldContent, newContent, serverContent) {
    var oldText = oldContent.text
    var serverText = serverContent.text
    var localText = newContent.text
    var isServerTextChanges = oldText !== serverText
    var isLocalTextChanges = oldText !== localText
    var isTextSynchronized = serverText === localText
    var conflicts = []
    if (!isTextSynchronized && isServerTextChanges && isLocalTextChanges) {
      var textWithConflicts = mergeText(oldText, serverText, localText)
      newContent.text = textWithConflicts[0]
      conflicts = textWithConflicts[1]
    } else if (!isTextSynchronized && isServerTextChanges) {
      newContent.text = serverText
    }

    newContent.properties = mergeObjects(oldContent.properties, newContent.properties, serverContent.properties)
    newContent.discussions = mergeObjects(oldContent.discussions, newContent.discussions, serverContent.discussions)
    newContent.comments = mergeObjects(oldContent.comments, newContent.comments, serverContent.comments)
    newContent.conflicts = mergeObjects(oldContent.conflicts, newContent.conflicts, serverContent.conflicts)
    return conflicts
  }

  clDiffUtils.offsetToPatch = offsetToPatch
  clDiffUtils.patchToOffset = patchToOffset
  clDiffUtils.serializeObject = serializeObject
  clDiffUtils.flattenContent = flattenContent
  clDiffUtils.applyFlattenedObjectPatches = applyFlattenedObjectPatches
  clDiffUtils.applyFlattenedObjectPatchesReverse = applyFlattenedObjectPatchesReverse
  clDiffUtils.applyFlattenedTextPatches = applyFlattenedTextPatches
  clDiffUtils.applyFlattenedTextPatchesReverse = applyFlattenedTextPatchesReverse
  clDiffUtils.applyCharPatches = applyCharPatches
  clDiffUtils.applyFlattenedContentChanges = applyFlattenedContentChanges
  clDiffUtils.getTextPatches = getTextPatches
  clDiffUtils.getObjectPatches = getObjectPatches
  clDiffUtils.quickPatch = quickPatch
  clDiffUtils.mergeObjects = mergeObjects
  clDiffUtils.mergeContent = mergeContent
  return clDiffUtils
})
