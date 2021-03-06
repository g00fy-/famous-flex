/**
 * This Source Code is licensed under the MIT license. If a copy of the
 * MIT-license was not distributed with this file, You can obtain one at:
 * http://opensource.org/licenses/mit-license.html.
 *
 * @author: Hein Rutjes (IjzerenHein)
 * @license MIT
 * @copyright Gloey Apps, 2014
 */

/*global define, console*/
/*eslint no-console: 0*/

/**
 * Lays a collection of renderables from left to right or top to bottom, and when the right/bottom edge is reached,
 * continues at the next column/row.
 *
 * |options|type|description|
 * |---|---|---|
 * |`itemSize`|Size/Function|Size of an item to layout or callback function which should return the size, e.g.: `function(renderNode, contextSize)`|
 * |`[margins]`|Number/Array|Margins shorthand (e.g. 5, [10, 20], [2, 5, 2, 10])|
 * |`[spacing]`|Number/Array|Spacing between items (e.g. 5, [10, 10])|
 * |`[justify]`|Bool/Array.Bool|Justify the renderables accross the width/height|
 *
 * Example:
 *
 * ```javascript
 * var FlexScrollView = require('famous-flex/FlexScrollView');
 * var CollectionLayout = require('famous-flex/layouts/CollectionLayout');
 *
 * var scrollView = new FlexScrollView({
 *   layout: CollectionLayout,
 *   layoutOptions: {
 *     itemSize: [100, 100],    // item has width and height of 100 pixels
 *     margins: [10, 5, 10, 5], // outer margins
 *     spacing: [10, 10]        // spacing between items
 *   },
 *   dataSource: [
 *     new Surface({content: 'item 1'}),
 *     new Surface({content: 'item 2'}),
 *     new Surface({content: 'item 3'})
 *   ]
 * });
 * ```
 * @module
 */
define(function(require, exports, module) {

    // import dependencies
    var Utility = require('famous/utilities/Utility');
    var LayoutUtility = require('../LayoutUtility');

    // Define capabilities of this layout function
    var capabilities = {
        sequence: true,
        direction: [Utility.Direction.Y, Utility.Direction.X],
        scrolling: true,
        trueSize: true,
        sequentialScrollingOptimized: true
    };

    // Prepare
    var context;
    var size;
    var direction;
    var alignment;
    var lineDirection;
    var lineLength;
    var offset;
    var margins;
    var margin = [0, 0];
    var spacing;
    var justify;
    var itemSize;
    var getItemSize;
    var lineNodes;

    /**
     * Lays out the renderables in a single line. Taking into account
     * the following variables:
     * - true-size
     * - margins
     * - spacing
     * - justify
     * - center align
     */
    function _layoutLine(next, endReached) {
        if (!lineNodes.length) {
            return 0;
        }

        // Determine size of the line
        var i;
        var lineSize = [0, 0];
        var lineNode;
        for (i = 0; i < lineNodes.length; i++) {
            lineSize[direction] = Math.max(lineSize[direction], lineNodes[i].size[direction]);
            lineSize[lineDirection] += ((i > 0) ? spacing[lineDirection] : 0) + lineNodes[i].size[lineDirection];
        }

        // Layout nodes from left to right or top to bottom
        var justifyOffset = justify[lineDirection] ? ((lineLength - lineSize[lineDirection]) / (lineNodes.length * 2)) : 0;
        var lineOffset = (direction ? margins[3] : margins[0]) + justifyOffset;
        var scrollLength;
        for (i = 0; i < lineNodes.length; i++) {
            lineNode = lineNodes[i];
            var translate = [0, 0, 0];
            translate[lineDirection] = lineOffset;
            translate[direction] = next ? offset : (offset - (lineSize[direction]));
            scrollLength = 0;
            if (i === 0) {
                scrollLength = lineSize[direction];
                if (endReached && ((next && !alignment) || (!next && alignment))) {
                    scrollLength += direction ? (margins[0] + margins[2]) : (margins[3] + margins[1]);
                }
                else {
                    scrollLength += spacing[direction];
                }
            }
            lineNode.set = {
                size: lineNode.size,
                translate: translate,
                scrollLength: scrollLength
            };
            lineOffset += lineNode.size[lineDirection] + spacing[lineDirection] + (justifyOffset * 2);
        }

        // Set nodes
        for (i = 0; i < lineNodes.length; i++) {
            lineNode = next ? lineNodes[i] : lineNodes[(lineNodes.length - 1) - i];
            context.set(lineNode.node, lineNode.set);
        }

        // Prepare for next line
        lineNodes = [];
        return lineSize[direction] + spacing[direction];
    }

    /**
     * Helper function to resolving the size of a node.
     */
    function _resolveNodeSize(node) {
        var localItemSize = itemSize;
        if (getItemSize) {
            localItemSize = getItemSize(node.renderNode, size);
        }
        if ((localItemSize[0] === true) || (localItemSize[1] === true)) {
            var result = context.resolveSize(node, size);
            if (localItemSize[0] !== true) {
                result[0] = itemSize[0];
            }
            if (localItemSize[1] !== true) {
                result[1] = itemSize[1];
            }
            return result;
        }
        else {
            return localItemSize;
        }
    }

    /**
     * Collection-layout
     */
    function CollectionLayout(context_, options) {

        // Prepare
        context = context_;
        size = context.size;
        direction = context.direction;
        alignment = context.alignment;
        lineDirection = (direction + 1) % 2;
        if ((options.gutter !== undefined) && console.warn) {
            console.warn('gutter has been deprecated for CollectionLayout, use margins & spacing instead');
        }
        if (options.gutter && !options.margins && !options.spacing) {
            var gutter = Array.isArray(options.gutter) ? options.gutter : [options.gutter, options.gutter];
            margins = [gutter[1], gutter[0], gutter[1], gutter[0]];
            spacing = gutter;
        }
        else {
            margins = LayoutUtility.normalizeMargins(options.margins);
            spacing = options.spacing || 0;
            spacing = Array.isArray(spacing) ? spacing : [spacing, spacing];
        }
        margin[0] = margins[direction ? 0 : 3];
        margin[1] = -margins[direction ? 2 : 1];
        justify = Array.isArray(options.justify) ? options.justify : (options.justify ? [true, true] : [false, false]);
        lineLength = size[lineDirection] - (direction ? (margins[3] + margins[1]) : (margins[0] + margins[2]));
        var node;
        var nodeSize;
        var lineOffset;
        var bound;

        //
        // Prepare item-size
        //
        if (!options.itemSize) {
            itemSize = [true, true]; // when no item-size specified, use size from renderables
        } else if (options.itemSize instanceof Function) {
            getItemSize = options.itemSize;
        } else if ((options.itemSize[0] === undefined) || (options.itemSize[0] === undefined)){
            // resolve 'undefined' into a fixed size
            itemSize = [
                (options.itemSize[0] === undefined) ? size[0] : options.itemSize[0],
                (options.itemSize[1] === undefined) ? size[1] : options.itemSize[1]
            ];
        }
        else {
            itemSize = options.itemSize;
        }

        //
        // Process all next nodes
        //
        offset = context.scrollOffset + margin[alignment];
        bound = context.scrollEnd + margin[alignment];
        lineOffset = 0;
        lineNodes = [];
        while (offset < bound) {
            node = context.next();
            if (!node) {
                _layoutLine(true, true);
                break;
            }
            nodeSize = _resolveNodeSize(node);
            lineOffset += (lineNodes.length ? spacing[lineDirection] : 0) + nodeSize[lineDirection];
            if (lineOffset > lineLength) {
                offset += _layoutLine(true, !node);
                lineOffset = nodeSize[lineDirection];
            }
            lineNodes.push({node: node, size: nodeSize});
        }

        //
        // Process previous nodes
        //
        offset = context.scrollOffset + margin[alignment];
        bound = context.scrollStart + margin[alignment];
        lineOffset = 0;
        lineNodes = [];
        while (offset > bound) {
            node = context.prev();
            if (!node) {
                _layoutLine(false, true);
                break;
            }
            nodeSize = _resolveNodeSize(node);
            lineOffset += (lineNodes.length ? spacing[lineDirection] : 0) + nodeSize[lineDirection];
            if (lineOffset > lineLength) {
                offset -= _layoutLine(false, !node);
                lineOffset = nodeSize[lineDirection];
            }
            lineNodes.unshift({node: node, size: nodeSize});
        }
    }

    CollectionLayout.Capabilities = capabilities;
    CollectionLayout.Name = 'CollectionLayout';
    CollectionLayout.Description = 'Multi-cell collection-layout with margins & spacing';
    module.exports = CollectionLayout;
});
