/* eslint no-console: 0 */

import Normalize from '../utils/normalize'
import String from '../utils/string'
import SCHEMA from '../schemas/core'
import { List } from 'immutable'

/**
 * An options object with normalize set to `false`.
 *
 * @type {Object}
 */

const OPTS = {
  normalize: false
}

/**
 * Add a new `mark` to the characters at `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Mixed} mark
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function addMarkAtRange(transform, range, mark, options = {}) {
  if (range.isCollapsed) return

  const { normalize = true } = options
  const { state } = transform
  const { document } = state
  const { startKey, startOffset, endKey, endOffset } = range
  const texts = document.getTextsAtRange(range)

  texts.forEach((text) => {
    const { key } = text
    let index = 0
    let length = text.length

    if (key == startKey) index = startOffset
    if (key == endKey) length = endOffset
    if (key == startKey && key == endKey) length = endOffset - startOffset

    transform.addMarkByKey(key, index, length, mark, { normalize })
  })
}

/**
 * Delete everything in a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteAtRange(transform, range, options = {}) {
  if (range.isCollapsed) return

  const { normalize = true } = options
  const { startKey, startOffset, endKey, endOffset } = range

  // If the start and end key are the same, we can just remove text.
  if (startKey == endKey) {
    const index = startOffset
    const length = endOffset - startOffset
    transform.removeTextByKey(startKey, index, length, { normalize })
    return
  }

  // Split at the range edges within a common ancestor, without normalizing.
  let { state } = transform
  let { document } = state
  let ancestor = document.getCommonAncestor(startKey, endKey)
  let startChild = ancestor.getHighestChild(startKey)
  let endChild = ancestor.getHighestChild(endKey)
  const startOff = (startChild.kind == 'text' ? 0 : startChild.getOffset(startKey)) + startOffset
  const endOff = (endChild.kind == 'text' ? 0 : endChild.getOffset(endKey)) + endOffset

  transform.splitNodeByKey(startChild.key, startOff, OPTS)
  transform.splitNodeByKey(endChild.key, endOff, OPTS)

  // Refresh variables.
  state = transform.state
  document = state.document
  ancestor = document.getCommonAncestor(startKey, endKey)
  startChild = ancestor.getHighestChild(startKey)
  endChild = ancestor.getHighestChild(endKey)
  const startIndex = ancestor.nodes.indexOf(startChild)
  const endIndex = ancestor.nodes.indexOf(endChild)
  const middles = ancestor.nodes.slice(startIndex + 1, endIndex + 1)

  // Remove all of the middle nodes, between the splits.
  if (middles.size) {
    middles.forEach(child => {
      transform.removeNodeByKey(child.key, OPTS)
    })
  }

  // If the start and end block are different, move all of the nodes from the
  // end block into the start block.
  const startBlock = document.getClosestBlock(startKey)
  const endBlock = document.getClosestBlock(document.getNextText(endKey).key)

  if (startBlock.key !== endBlock.key) {
    endBlock.nodes.forEach((child, i) => {
      const newKey = startBlock.key
      const newIndex = startBlock.nodes.size + i
      transform.moveNodeByKey(child.key, newKey, newIndex, OPTS)
    })

    const lonely = document.getFurthest(endBlock.key, p => p.nodes.size == 1) || endBlock
    transform.removeNodeByKey(lonely.key, OPTS)
  }

  if (normalize) {
    transform.normalizeNodeByKey(ancestor.key, SCHEMA)
  }
}

/**
 * Delete backward until the character boundary at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteCharBackwardAtRange(transform, range, options) {
  const { state } = transform
  const { startOffset, startBlock } = state
  const { text } = startBlock
  const n = String.getCharOffsetBackward(text, startOffset)
  transform.deleteBackwardAtRange(range, n, options)
}

/**
 * Delete backward until the line boundary at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteLineBackwardAtRange(transform, range, options) {
  const { state } = transform
  const { startOffset } = state
  transform.deleteBackwardAtRange(range, startOffset, options)
}

/**
 * Delete backward until the word boundary at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteWordBackwardAtRange(transform, range, options) {
  const { state } = transform
  const { startOffset, startBlock } = state
  const { text } = startBlock
  const n = String.getWordOffsetBackward(text, startOffset)
  transform.deleteBackwardAtRange(range, n, options)
}

/**
 * Delete backward `n` characters at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Number} n (optional)
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteBackwardAtRange(transform, range, n = 1, options = {}) {
  const { normalize = true } = options
  const { state } = transform
  const { document } = state
  const { startKey, focusOffset } = range

  // If the range is expanded, perform a regular delete instead.
  if (range.isExpanded) {
    transform.deleteAtRange(range, { normalize })
    return
  }

  // If the closest block is void, delete it.
  const block = document.getClosestBlock(startKey)
  if (block && block.isVoid) {
    transform.removeNodeByKey(block.key, { normalize })
    return
  }

  // If the closest inline is void, delete it.
  const inline = document.getClosestInline(startKey)
  if (inline && inline.isVoid) {
    transform.removeNodeByKey(inline.key, { normalize })
    return
  }

  // If the range is at the start of the document, abort.
  if (range.isAtStartOf(document)) {
    return
  }

  // If the range is at the start of the text node, we need to figure out what
  // is behind it to know how to delete...
  const text = document.getDescendant(startKey)
  if (range.isAtStartOf(text)) {
    const prev = document.getPreviousText(text.key)
    const prevBlock = document.getClosestBlock(prev.key)
    const prevInline = document.getClosestInline(prev.key)

    // If the previous block is void, remove it.
    if (prevBlock && prevBlock.isVoid) {
      transform.removeNodeByKey(prevBlock.key, { normalize })
      return
    }

    // If the previous inline is void, remove it.
    if (prevInline && prevInline.isVoid) {
      transform.removeNodeByKey(prevInline.key, { normalize })
      return
    }

    // If the previous text's block is inside the current block, then we need
    // to remove a character when deleteing. Otherwise, we just want to join
    // the two blocks together.
    range = range.merge({
      anchorKey: prev.key,
      anchorOffset: prevBlock == block ? prev.length - 1 : prev.length,
    })

    transform.deleteAtRange(range, { normalize })
    return
  }

  // Otherwise, just remove a character backwards.
  range = range.merge({
    focusOffset: focusOffset - n,
    isBackward: true,
  })

  transform.deleteAtRange(range, { normalize })
}

/**
 * Delete forward until the character boundary at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteCharForwardAtRange(transform, range, options) {
  const { state } = transform
  const { startOffset, startBlock } = state
  const { text } = startBlock
  const n = String.getCharOffsetForward(text, startOffset)
  transform.deleteForwardAtRange(range, n, options)
}

/**
 * Delete forward until the line boundary at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteLineForwardAtRange(transform, range, options) {
  const { state } = transform
  const { startOffset, startBlock } = state
  transform.deleteForwardAtRange(range, startBlock.length - startOffset, options)
}

/**
 * Delete forward until the word boundary at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteWordForwardAtRange(transform, range, options) {
  const { state } = transform
  const { startOffset, startBlock } = state
  const { text } = startBlock
  const n = String.getWordOffsetForward(text, startOffset)
  transform.deleteForwardAtRange(range, n, options)
}

/**
 * Delete forward `n` characters at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Number} n (optional)
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function deleteForwardAtRange(transform, range, n = 1, options = {}) {
  const { normalize = true } = options
  const { state } = transform
  const { document } = state
  const { startKey, focusOffset } = range

  if (range.isExpanded) {
    transform.deleteAtRange(range, { normalize })
    return
  }

  const block = document.getClosestBlock(startKey)
  if (block && block.isVoid) {
    transform.removeNodeByKey(block.key, { normalize })
    return
  }

  const inline = document.getClosestInline(startKey)
  if (inline && inline.isVoid) {
    transform.removeNodeByKey(inline.key, { normalize })
    return
  }

  if (range.isAtEndOf(document)) {
    return
  }

  const text = document.getDescendant(startKey)
  if (range.isAtEndOf(text)) {
    const next = document.getNextText(text.key)
    const nextBlock = document.getClosestBlock(next.key)
    const nextInline = document.getClosestInline(next.key)

    if (nextBlock && nextBlock.isVoid) {
      transform.removeNodeByKey(nextBlock.key, { normalize })
      return
    }

    if (nextInline && nextInline.isVoid) {
      transform.removeNodeByKey(nextInline.key, { normalize })
      return
    }

    // If the next text's block is inside the current block, then we need
    // to remove a character when deleteing. Otherwise, we just want to join
    // the two blocks together.
    range = range.merge({
      focusKey: next.key,
      focusOffset: nextBlock == block ? 1 : 0
    })

    transform.deleteAtRange(range, { normalize })
    return
  }

  range = range.merge({
    focusOffset: focusOffset + n
  })

  transform.deleteAtRange(range, { normalize })
}

/**
 * Insert a `block` node at `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Block|String|Object} block
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function insertBlockAtRange(transform, range, block, options = {}) {
  block = Normalize.block(block)
  const { normalize = true } = options

  if (range.isExpanded) {
    transform.deleteAtRange(range)
    range = range.collapseToStart()
  }

  const { state } = transform
  const { document } = state
  const { startKey, startOffset } = range
  const startText = document.assertDescendant(startKey)
  const startBlock = document.getClosestBlock(startKey)
  const parent = document.getParent(startBlock.key)
  const index = parent.nodes.indexOf(startBlock)

  if (startBlock.isVoid) {
    transform.insertNodeByKey(parent.key, index + 1, block, { normalize })
  }

  else if (startBlock.isEmpty) {
    transform.removeNodeByKey(startBlock.key)
    transform.insertNodeByKey(parent.key, index, block, { normalize })
  }

  else if (range.isAtStartOf(startBlock)) {
    transform.insertNodeByKey(parent.key, index, block, { normalize })
  }

  else if (range.isAtEndOf(startBlock)) {
    transform.insertNodeByKey(parent.key, index + 1, block, { normalize })
  }

  else {
    const offset = startBlock.getOffset(startText.key) + startOffset
    transform.splitNodeByKey(startBlock.key, offset, { normalize })
    transform.insertNodeByKey(parent.key, index + 1, block, { normalize })
  }

  if (normalize) {
    transform.normalizeNodeByKey(parent.key, SCHEMA)
  }
}

/**
 * Insert a `fragment` at a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Document} fragment
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function insertFragmentAtRange(transform, range, fragment, options = {}) {
  const { normalize = true } = options

  // If the range is expanded, delete it first.
  if (range.isExpanded) {
    transform.deleteAtRange(range, OPTS)
    range = range.collapseToStart()
  }

  // If the fragment is empty, there's nothing to do after deleting.
  if (!fragment.length) return

  // Regenerate the keys for all of the fragments nodes, so that they're
  // guaranteed not to collide with the existing keys in the document. Otherwise
  // they will be rengerated automatically and we won't have an easy way to
  // reference them.
  fragment = fragment.mapDescendants(child => child.regenerateKey())

  // Calculate a few things...
  const { startKey, startOffset } = range
  let { state } = transform
  let { document } = state
  let startText = document.getDescendant(startKey)
  let startBlock = document.getClosestBlock(startText.key)
  let startChild = startBlock.getHighestChild(startText.key)
  const isAtStart = range.isAtStartOf(startBlock)
  const parent = document.getParent(startBlock.key)
  const index = parent.nodes.indexOf(startBlock)
  const offset = startChild == startText
    ? startOffset
    : startChild.getOffset(startText.key) + startOffset

  const blocks = fragment.getBlocks()
  const firstBlock = blocks.first()
  const lastBlock = blocks.last()

  // If the first and last block aren't the same, we need to insert all of the
  // nodes after the fragment's first block at the index.
  if (firstBlock != lastBlock) {
    const lonelyParent = fragment.getFurthest(firstBlock.key, p => p.nodes.size == 1)
    const lonelyChild = lonelyParent || firstBlock
    const startIndex = parent.nodes.indexOf(startBlock)
    fragment = fragment.removeDescendant(lonelyChild.key)

    fragment.nodes.forEach((node, i) => {
      const newIndex = startIndex + i + 1
      transform.insertNodeByKey(parent.key, newIndex, node, OPTS)
    })
  }

  // Check if we need to split the node.
  if (startOffset != 0) {
    transform.splitNodeByKey(startChild.key, offset, OPTS)
  }

  // Update our variables with the new state.
  state = transform.state
  document = state.document
  startText = document.getDescendant(startKey)
  startBlock = document.getClosestBlock(startKey)
  startChild = startBlock.getHighestChild(startText.key)

  // If the first and last block aren't the same, we need to move any of the
  // starting block's children after the split into the last block of the
  // fragment, which has already been inserted.
  if (firstBlock != lastBlock) {
    const nextChild = isAtStart ? startChild : startBlock.getNextSibling(startChild.key)
    const nextNodes = nextChild ? startBlock.nodes.skipUntil(n => n.key == nextChild.key) : List()
    const lastIndex = lastBlock.nodes.size

    nextNodes.forEach((node, i) => {
      const newIndex = lastIndex + i
      transform.moveNodeByKey(node.key, lastBlock.key, newIndex, OPTS)
    })
  }

  // If the starting block is empty, we replace it entirely with the first block
  // of the fragment, since this leads to a more expected behavior for the user.
  if (startBlock.isEmpty) {
    transform.removeNodeByKey(startBlock.key, OPTS)
    transform.insertNodeByKey(parent.key, index, firstBlock, OPTS)
  }

  // Otherwise, we maintain the starting block, and insert all of the first
  // block's inline nodes into it at the split point.
  else {
    const inlineChild = startBlock.getHighestChild(startText.key)
    const inlineIndex = startBlock.nodes.indexOf(inlineChild)

    firstBlock.nodes.forEach((inline, i) => {
      const o = startOffset == 0 ? 0 : 1
      const newIndex = inlineIndex + i + o
      transform.insertNodeByKey(startBlock.key, newIndex, inline, OPTS)
    })
  }

  // Normalize if requested.
  if (normalize) {
    transform.normalizeNodeByKey(parent.key, SCHEMA)
  }
}

/**
 * Insert an `inline` node at `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Inline|String|Object} inline
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function insertInlineAtRange(transform, range, inline, options = {}) {
  const { normalize = true } = options
  inline = Normalize.inline(inline)

  if (range.isExpanded) {
    transform.deleteAtRange(range, OPTS)
    range = range.collapseToStart()
  }

  const { state } = transform
  const { document } = state
  const { startKey, startOffset } = range
  const parent = document.getParent(startKey)
  const startText = document.assertDescendant(startKey)
  const index = parent.nodes.indexOf(startText)

  if (parent.isVoid) return

  transform.splitNodeByKey(startKey, startOffset, OPTS)
  transform.insertNodeByKey(parent.key, index + 1, inline, OPTS)

  if (normalize) {
    transform.normalizeNodeByKey(parent.key, SCHEMA)
  }
}

/**
 * Insert `text` at a `range`, with optional `marks`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {String} text
 * @param {Set<Mark>} marks (optional)
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function insertTextAtRange(transform, range, text, marks, options = {}) {
  let { normalize } = options
  const { state } = transform
  const { document } = state
  const { startKey, startOffset } = range
  const parent = document.getParent(startKey)

  if (parent.isVoid) return

  if (range.isExpanded) {
    transform.deleteAtRange(range, OPTS)
  }

  // PERF: Unless specified, don't normalize if only inserting text.
  if (normalize !== undefined) {
    normalize = range.isExpanded
  }

  transform.insertTextByKey(startKey, startOffset, text, marks, { normalize })
}

/**
 * Remove an existing `mark` to the characters at `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Mark|String} mark (optional)
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function removeMarkAtRange(transform, range, mark, options = {}) {
  if (range.isCollapsed) return

  const { normalize = true } = options
  const { state } = transform
  const { document } = state
  const texts = document.getTextsAtRange(range)
  const { startKey, startOffset, endKey, endOffset } = range

  texts.forEach((text) => {
    const { key } = text
    let index = 0
    let length = text.length

    if (key == startKey) index = startOffset
    if (key == endKey) length = endOffset
    if (key == startKey && key == endKey) length = endOffset - startOffset

    transform.removeMarkByKey(key, index, length, mark, { normalize })
  })
}

/**
 * Set the `properties` of block nodes in a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object|String} properties
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function setBlockAtRange(transform, range, properties, options = {}) {
  const { normalize = true } = options
  const { state } = transform
  const { document } = state
  const blocks = document.getBlocksAtRange(range)

  blocks.forEach((block) => {
    transform.setNodeByKey(block.key, properties, { normalize })
  })
}

/**
 * Set the `properties` of inline nodes in a `range`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Object|String} properties
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function setInlineAtRange(transform, range, properties, options = {}) {
  const { normalize = true } = options
  const { state } = transform
  const { document } = state
  const inlines = document.getInlinesAtRange(range)

  inlines.forEach((inline) => {
    transform.setNodeByKey(inline.key, properties, { normalize})
  })
}

/**
 * Split the block nodes at a `range`, to optional `height`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Number} height (optional)
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function splitBlockAtRange(transform, range, height = 1, options = {}) {
  const { normalize = true } = options

  if (range.isExpanded) {
    transform.deleteAtRange(range, { normalize })
    range = range.collapseToStart()
  }

  const { startKey, startOffset } = range
  const { state } = transform
  const { document } = state
  let node = document.assertDescendant(startKey)
  let parent = document.getClosestBlock(node.key)
  let offset = startOffset
  let h = 0

  while (parent && parent.kind == 'block' && h < height) {
    offset += parent.getOffset(node.key)
    node = parent
    parent = document.getClosestBlock(parent.key)
    h++
  }

  transform.splitNodeByKey(node.key, offset, { normalize })
}

/**
 * Split the inline nodes at a `range`, to optional `height`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Number} height (optional)
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function splitInlineAtRange(transform, range, height = Infinity, options = {}) {
  const { normalize = true } = options

  if (range.isExpanded) {
    transform.deleteAtRange(range, { normalize })
    range = range.collapseToStart()
  }

  const { startKey, startOffset } = range
  const { state } = transform
  const { document } = state
  let node = document.assertDescendant(startKey)
  let parent = document.getClosestInline(node.key)
  let offset = startOffset
  let h = 0

  while (parent && parent.kind == 'inline' && h < height) {
    offset += parent.getOffset(node.key)
    node = parent
    parent = document.getClosestInline(parent.key)
    h++
  }

  transform.splitNodeByKey(node.key, offset, { normalize })
}

/**
 * Add or remove a `mark` from the characters at `range`, depending on whether
 * it's already there.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Mixed} mark
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function toggleMarkAtRange(transform, range, mark, options = {}) {
  if (range.isCollapsed) return

  mark = Normalize.mark(mark)

  const { normalize = true } = options
  const { state } = transform
  const { document } = state
  const marks = document.getMarksAtRange(range)
  const exists = marks.some(m => m.equals(mark))

  if (exists) {
    transform.removeMarkAtRange(range, mark, { normalize })
  } else {
    transform.addMarkAtRange(range, mark, { normalize })
  }
}

/**
 * Unwrap all of the block nodes in a `range` from a block with `properties`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {String|Object} properties
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function unwrapBlockAtRange(transform, range, properties, options = {}) {
  properties = Normalize.nodeProperties(properties)

  const { normalize = true } = options
  let { state } = transform
  let { document } = state
  const blocks = document.getBlocksAtRange(range)
  const wrappers = blocks
    .map((block) => {
      return document.getClosest(block.key, (parent) => {
        if (parent.kind != 'block') return false
        if (properties.type != null && parent.type != properties.type) return false
        if (properties.isVoid != null && parent.isVoid != properties.isVoid) return false
        if (properties.data != null && !parent.data.isSuperset(properties.data)) return false
        return true
      })
    })
    .filter(exists => exists)
    .toOrderedSet()
    .toList()

  wrappers.forEach((block) => {
    const first = block.nodes.first()
    const last = block.nodes.last()
    const parent = document.getParent(block.key)
    const index = parent.nodes.indexOf(block)

    const children = block.nodes.filter((child) => {
      return blocks.some(b => child == b || child.hasDescendant(b.key))
    })

    const firstMatch = children.first()
    let lastMatch = children.last()

    if (first == firstMatch && last == lastMatch) {
      block.nodes.forEach((child, i) => {
        transform.moveNodeByKey(child.key, parent.key, index + i, OPTS)
      })

      transform.removeNodeByKey(block.key, OPTS)
    }

    else if (last == lastMatch) {
      block.nodes
        .skipUntil(n => n == firstMatch)
        .forEach((child, i) => {
          transform.moveNodeByKey(child.key, parent.key, index + 1 + i, OPTS)
        })
    }

    else if (first == firstMatch) {
      block.nodes
        .takeUntil(n => n == lastMatch)
        .push(lastMatch)
        .forEach((child, i) => {
          transform.moveNodeByKey(child.key, parent.key, index + i, OPTS)
        })
    }

    else {
      const offset = block.getOffset(firstMatch.key)

      transform.splitNodeByKey(block.key, offset, OPTS)
      state = transform.state
      document = state.document

      children.forEach((child, i) => {
        if (i == 0) {
          const extra = child
          child = document.getNextBlock(child.key)
          transform.removeNodeByKey(extra.key, OPTS)
        }

        transform.moveNodeByKey(child.key, parent.key, index + 1 + i, OPTS)
      })
    }
  })

  // TODO: optmize to only normalize the right block
  if (normalize) {
    transform.normalizeDocument(SCHEMA)
  }
}

/**
 * Unwrap the inline nodes in a `range` from an inline with `properties`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {String|Object} properties
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function unwrapInlineAtRange(transform, range, properties) {
  properties = Normalize.nodeProperties(properties)

  let { state } = transform
  let { document } = state
  let selectionLength = state.selection.endOffset - state.selection.startOffset
  const texts = document.getTextsAtRange(range)
  const inlines = texts
    .map((text) => {
      return document.getClosest(text, (parent) => {
        if (parent.kind != 'inline') return false
        if (properties.type != null && parent.type != properties.type) return false
        if (properties.isVoid != null && parent.isVoid != properties.isVoid) return false
        if (properties.data != null && !parent.data.isSuperset(properties.data)) return false
        return true
      })
    })
    .filter(exists => exists)
    .toOrderedSet()
    .toList()

  let beginning = document.getPreviousSibling(inlines.first())
  let startOffset = beginning.length;

  inlines.forEach((inline) => {
    const first = inline.nodes.first()
    const last = inline.nodes.last()
    const parent = document.getParent(inline)
    const index = parent.nodes.indexOf(inline)

    const children = inline.nodes.filter((child) => {
      return texts.some(t => child == t)
    })

    const firstMatch = children.first()
    let lastMatch = children.last()

    transform.unsetSelection()

    if (first == firstMatch && last == lastMatch) {
      inline.nodes.forEach((child, i) => {
        transform.moveNodeByKey(child.key, parent.key, index + i)
      })

      transform.removeNodeByKey(inline.key)
    }

    else if (last == lastMatch) {
      inline.nodes
        .skipUntil(n => n == firstMatch)
        .forEach((child, i) => {
          transform.moveNodeByKey(child.key, parent.key, index + 1 + i)
        })
    }

    else if (first == firstMatch) {
      inline.nodes
        .takeUntil(n => n == lastMatch)
        .push(lastMatch)
        .forEach((child, i) => {
          transform.moveNodeByKey(child.key, parent.key, index + i)
        })
    }

    else {
      const offset = inline.getOffset(firstMatch)

      transform.splitNodeByKey(inline.key, offset)
      state = transform.state
      document = state.document
      const extra = document.getPreviousSibling(firstMatch)

      children.forEach((child, i) => {
        transform.moveNodeByKey(child.key, parent.key, index + 1 + i)
      })

      transform.removeNodeByKey(extra.key)
    }
  })

  transform.moveTo(
    {
      anchorKey: beginning.key,
      anchorOffset: startOffset,
      focusKey: beginning.key,
      focusOffset: startOffset}
    )
    .extendForward(selectionLength)
  transform.normalizeDocument()
  return transform
}

/**
 * Wrap all of the blocks in a `range` in a new `block`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Block|Object|String} block
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function wrapBlockAtRange(transform, range, block, options = {}) {
  block = Normalize.block(block)
  block = block.merge({ nodes: block.nodes.clear() })

  const { normalize = true } = options
  const { state } = transform
  const { document } = state

  const blocks = document.getBlocksAtRange(range)
  const firstblock = blocks.first()
  const lastblock = blocks.last()
  let parent, siblings, index

  // if there is only one block in the selection then we know the parent and siblings
  if (blocks.length === 1) {
    parent = document.getParent(firstblock.key)
    siblings = blocks
  }

  // determine closest shared parent to all blocks in selection
  else {
    parent = document.getClosest(firstblock.key, p1 => {
      return !!document.getClosest(lastblock.key, p2 => p1 == p2)
    })
  }

  // if no shared parent could be found then the parent is the document
  if (parent == null) parent = document

  // create a list of direct children siblings of parent that fall in the selection
  if (siblings == null) {
    const indexes = parent.nodes.reduce((ind, node, i) => {
      if (node == firstblock || node.hasDescendant(firstblock.key)) ind[0] = i
      if (node == lastblock || node.hasDescendant(lastblock.key)) ind[1] = i
      return ind
    }, [])

    index = indexes[0]
    siblings = parent.nodes.slice(indexes[0], indexes[1] + 1)
  }

  // get the index to place the new wrapped node at
  if (index == null) {
    index = parent.nodes.indexOf(siblings.first())
  }

  // inject the new block node into the parent
  transform.insertNodeByKey(parent.key, index, block, OPTS)

  // move the sibling nodes into the new block node
  siblings.forEach((node, i) => {
    transform.moveNodeByKey(node.key, block.key, i, OPTS)
  })

  if (normalize) {
    transform.normalizeNodeByKey(parent.key, SCHEMA)
  }
}

/**
 * Wrap the text and inlines in a `range` in a new `inline`.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {Inline|Object|String} inline
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function wrapInlineAtRange(transform, range, inline, options = {}) {
  let { state } = transform
  let { document } = state
  const { normalize = true } = options
  const { startKey, startOffset, endKey, endOffset } = range

  if (range.isCollapsed) {
    // Wrapping an inline void
    const inlineParent = document.getClosestInline(startKey)
    if (!inlineParent.isVoid) {
      return
    }

    return transform.wrapInlineByKey(inlineParent.key, inline, options)
  }

  inline = Normalize.inline(inline)
  inline = inline.merge({ nodes: inline.nodes.clear() })

  const blocks = document.getBlocksAtRange(range)
  let startBlock = document.getClosestBlock(startKey)
  let endBlock = document.getClosestBlock(endKey)
  let startChild = startBlock.getHighestChild(startKey)
  let endChild = endBlock.getHighestChild(endKey)
  const startIndex = startBlock.nodes.indexOf(startChild)
  const endIndex = endBlock.nodes.indexOf(endChild)

  const startOff = startChild.key == startKey
    ? startOffset
    : startChild.getOffset(startKey) + startOffset

  const endOff = endChild.key == endKey
    ? endOffset
    : endChild.getOffset(endKey) + endOffset

  if (startBlock == endBlock) {
    if (endOff != endChild.length) {
      transform.splitNodeByKey(endChild.key, endOff, OPTS)
    }

    if (startOff != 0) {
      transform.splitNodeByKey(startChild.key, startOff, OPTS)
    }

    state = transform.state
    document = state.document
    startBlock = document.getClosestBlock(startKey)
    startChild = startBlock.getHighestChild(startKey)

    const startInner = startOff == 0
      ? startChild
      : document.getNextSibling(startChild.key)

    const startInnerIndex = startBlock.nodes.indexOf(startInner)

    const endInner = startKey == endKey ? startInner : startBlock.getHighestChild(endKey)
    const inlines = startBlock.nodes
      .skipUntil(n => n == startInner)
      .takeUntil(n => n == endInner)
      .push(endInner)

    const node = inline.regenerateKey()

    transform.insertNodeByKey(startBlock.key, startInnerIndex, node, OPTS)

    inlines.forEach((child, i) => {
      transform.moveNodeByKey(child.key, node.key, i, OPTS)
    })

    if (normalize) {
      transform.normalizeNodeByKey(startBlock.key, SCHEMA)
    }
  }

  else {
    transform.splitNodeByKey(startChild.key, startOff, OPTS)
    transform.splitNodeByKey(endChild.key, endOff, OPTS)

    state = transform.state
    document = state.document
    startBlock = document.getDescendant(startBlock.key)
    endBlock = document.getDescendant(endBlock.key)

    const startInlines = startBlock.nodes.slice(startIndex + 1)
    const endInlines = endBlock.nodes.slice(0, endIndex + 1)
    const startNode = inline.regenerateKey()
    const endNode = inline.regenerateKey()

    transform.insertNodeByKey(startBlock.key, startIndex - 1, startNode, OPTS)
    transform.insertNodeByKey(endBlock.key, endIndex, endNode, OPTS)

    startInlines.forEach((child, i) => {
      transform.moveNodeByKey(child.key, startNode.key, i, OPTS)
    })

    endInlines.forEach((child, i) => {
      transform.moveNodeByKey(child.key, endNode.key, i, OPTS)
    })

    if (normalize) {
      transform
        .normalizeNodeByKey(startBlock.key, SCHEMA)
        .normalizeNodeByKey(endBlock.key, SCHEMA)
    }

    blocks.slice(1, -1).forEach((block) => {
      const node = inline.regenerateKey()
      transform.insertNodeByKey(block.key, 0, node, OPTS)

      block.nodes.forEach((child, i) => {
        transform.moveNodeByKey(child.key, node.key, i, OPTS)
      })

      if (normalize) {
        transform.normalizeNodeByKey(block.key, SCHEMA)
      }
    })
  }
}

/**
 * Wrap the text in a `range` in a prefix/suffix.
 *
 * @param {Transform} transform
 * @param {Selection} range
 * @param {String} prefix
 * @param {String} suffix (optional)
 * @param {Object} options
 *   @property {Boolean} normalize
 */

export function wrapTextAtRange(transform, range, prefix, suffix = prefix, options = {}) {
  const { normalize = true } = options
  const { startKey, endKey } = range
  const start = range.collapseToStart()
  let end = range.collapseToEnd()

  if (startKey == endKey) {
    end = end.moveForward(prefix.length)
  }

  transform.insertTextAtRange(start, prefix, [], { normalize })
  transform.insertTextAtRange(end, suffix, [], { normalize })
}
