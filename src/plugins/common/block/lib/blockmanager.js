/*!
* Aloha Editor
* Author & Copyright (c) 2010 Gentics Software GmbH
* aloha-sales@gentics.com
* Licensed unter the terms of http://www.aloha-editor.com/license.html
*/

define(['aloha', 'aloha/jquery', 'aloha/floatingmenu', 'aloha/observable', 'aloha/registry'],
function(Aloha, jQuery, FloatingMenu, Observable, Registry) {
	"use strict";

	var
		GENTICS = window.GENTICS;

	/**
	 * @name block.blockmanager
	 * @class Block manager singleton
	 */
	var BlockManager = new (Class.extend(Observable,
	/** @lends block.blockmanager */
	{

		/**
		 * @name block.blockmanager#block-selection-change
		 * @event
		 * @param {Array} selectedBlocks Array of AbstractBlock objects, containing selected blocks. The first element in the array is the innermost block, and the other elements are the parent blocks.
		 */

		/**
		 * @name block.blockmanager#block-delete
		 * @event fired directly before a block is deleted
		 * @param {AbstractBlock} the block to be deleted
		 */

		defaults: {
			'aloha-block-type': 'DefaultBlock'
		},

		/**
		 * Registry of block types
		 * @type Registry
		 */
		blockTypes: null,

		/**
		 * Registry of blocks
		 * @type Registry
		 */
		blocks: null,

		activeBlocks: null,

		/**
		 * @constructor
		 */
		_constructor: function() {
			FloatingMenu.createScope('Aloha.Block');
			this.blockTypes = new Registry();
			this.blocks = new Registry();
			this.activeBlocks = {};
		},

		/**
		 * Register initial event handlers
		 *
		 * @private
		 */
		registerEventHandlers: function() {
			var that = this;

			// Register event handlers for deactivating an Aloha Block
			jQuery(document).bind('click', function(event) {
				if (that.activeBlocks == {}) return;
				if (jQuery(event.target).parents('.aloha-sidebar-bar, .aloha-block-do-not-deactivate, .aloha-floatingmenu').length > 0
					|| jQuery(event.target).is('.aloha-sidebar-bar, .aloha-block-do-not-deactivate, .aloha-floatingmenu')) {
					// If we are inside the sidebar, the floating menu or other elements which should not trigger the block deactivation, we do an early return.
					return;
				}
				BlockManager._deactivateActiveBlocks();
			});

			Aloha.bind('aloha-selection-changed', function(evt, selection, originalEvent) {
				// the following line is needed to de-select blocks when navigating over them using the mouse cursors.
				// We only want to execute it though, if we are not inside a block, as it would otherwise
				// directly deselect the block we just selected. This is just a hotfix and not the final solution yet.
				if (selection && jQuery(selection.getCommonAncestorContainer()).parents('.aloha-block').length > 0) {
					return;
				}
				that._deactivateActiveBlocks();
			});
		},

		/**
		 * Blockify a given element with the instance defaults
		 * Directly called when one does jQuery.alohaBlock(instanceDefaults)
		 *
		 * @private
		 */
		_blockify: function(element, instanceDefaults) {
			var attributes, block;
			element = jQuery(element);

			var tagName = element[0].tagName.toLowerCase();
			if (tagName !== 'span' && tagName !== 'div') {
				Aloha.Log.error('block/blockmanager', 'Blocks can only be created from <div> or <span> element. You passed ' + tagName + '.');
				return;
			}

			// TODO: check if object is already Block-ified

			attributes = this.getConfig(element, instanceDefaults);

			element.contentEditable(false);

			if (!this.blockTypes.has(attributes['aloha-block-type'])) {
				Aloha.Log.error('block/blockmanager', 'Block Type ' + attributes['aloha-block-type'] + ' not found!');
				return;
			}

			block = new (this.blockTypes.get(attributes['aloha-block-type']))(element);
			block._$element.addClass('aloha-block-' + attributes['aloha-block-type']);
			block._$element.attr('style', element.attr('style')); // TODO: write test case which checks that styles are applied from child to container!
			element.attr('style', '');
			element.find('img').attr('draggable', 'false');

			// Save attributes on block, but ignore jquery attribute.
			jQuery.each(attributes, function(k, v) {
				if (k.indexOf('jQuery') === 0) return;
				//  We use _setAttribute here, as we also want to set internal properties like aloha-block-type.
				block._setAttribute(k, v);
			});

			// Remove the data-attributes from the child element, as they have been moved to the parent element.
			jQuery.each(element.data(), function(k, v) {
				element.removeAttr('data-' + k);
			});

			// Register block
			this.blocks.register(block.getId(), block);

			block._renderAndSetContent();
		},

		/**
		 * Deactivate all active blocks
		 *
		 * @private
		 */
		_deactivateActiveBlocks: function() {
			jQuery.each(jQuery.extend({}, this.activeBlocks), function(id) {
				var block = BlockManager.getBlock(id);
				if (block) {
					block.deactivate();
				}
			});
		},

		/**
		 * Merges the config from different places, and return the merged config.
		 *
		 * @private
		 */
		getConfig: function(blockElement, instanceDefaults) {
			// TODO: merge from plugin settings
			// TODO: What about double matches / overrides / multiple selectors applying?
			var settingsDefaults = {};

			return jQuery.extend(
				{},
				this.defaults,
				settingsDefaults,
				instanceDefaults,
				blockElement.data()
			);
		},

		/**
		 * Get a Block instance by id or DOM node. The DOM node can be either
		 * the DOM node of the wrapping element ($_element), or $_innerElement
		 *
		 * @param {String|DOMNode} idOrDomNode
		 * @return {block.block.AbstractBlock} Block instance
		 */
		getBlock: function(idOrDomNode) {
			var id, domNode;
			if (typeof idOrDomNode === 'object') {
				domNode = jQuery(idOrDomNode);
				if (domNode.hasClass('aloha-block-inner')) {
					// We are at the inner block wrapper, so we have to go up one level,
					// to find the block itself
					domNode = domNode.parent();
				}
				id = domNode.attr('id');
			} else {
				id = idOrDomNode;
			}

			return this.blocks.get(id);
		},

		/**
		 * Unregister (e.g. remove) the given block
		 *
		 * @param {Object|String} blockOrBlockId Block or block id
		 */
		_unregisterBlock: function(blockOrBlockId) {
			var id;
			if (typeof blockOrBlockId === 'object') {
				id = blockOrBlockId.getId();
			} else {
				id = blockOrBlockId;
			}
			this.blocks.unregister(blockOrBlockId);
		},

		/**
		 * Register the given block type
		 *
		 * @param {String} Identifier
		 * @param {Class} A class that extends block.block.AbstractBlock
		 */
		registerBlockType: function(identifier, blockType) {
			FloatingMenu.createScope('Aloha.Block.' + identifier, 'Aloha.Block');
			this.blockTypes.register(identifier, blockType);
		},

		/**
		 * Get all active blocks indexed by block id
		 *
		 * @return {Object}
		 */
		getActiveBlocks: function() {
			var activeBlocks = {};
			jQuery.each(this.blocks.getEntries(), function(blockId, block) {
				if (block.isActive()) {
					activeBlocks[blockId] = block;
				}
			});
			return activeBlocks;
		},

		_setActive: function(block) {
			this.activeBlocks[block.id] = true;
		},

		_setInactive: function(block) {
			delete this.activeBlocks[block.id];
		}
	}))();

	Aloha.Block = Aloha.Block || {};
	Aloha.Block.BlockManager = BlockManager;

	return BlockManager;
});
