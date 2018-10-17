import 'fs-globals'
import 'wicg-inert'

var dialogStack = [];
var buffer = [];
var bufferElements = (document.readyState === 'loading');

window.FS = window.FS || {};
FS.dialog = FS.dialog || {};
FS.dialog.service = FS.dialog.service || {};
var Node = window.Node || {};
var ShadowRoot = window.ShadowRoot || {};

/**
 * This function will register global elements and attach a reference to them to FS.dialog
 * @param {string} elementName - The name of the element to register e.g. fs-person-card
 * @returns {undefined} - Returns void.
 */
FS.dialog.register = function (elementName) {
  if (bufferElements) {
    buffer.push(elementName);
    return;
  }
  registerElement(elementName);
};

function registerElement (elementName) {
  var camelCaseName = elementName.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
  if (FS.dialog[camelCaseName]) {
    console.error('Attempted to create element', elementName, 'which already exists');
    return;
  }
  var element = document.createElement(elementName);
  document.body.appendChild(element);
  Object.defineProperty(FS.dialog, camelCaseName, {
    get: function () {
      return element;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    bufferElements = false;
    buffer.forEach(registerElement);
  });
}

FS.dialog.service.addDialogToStack = function (dialogElement) {
  FS.dialog.service.removeDialogFromStack(dialogElement);
  dialogStack.push(dialogElement);
};

FS.dialog.service.removeDialogFromStack = function (dialogElement) {
  var index = dialogStack.indexOf(dialogElement);
  if (index > -1) dialogStack.splice(index, 1);
};

FS.dialog.service.dialogIsOnTop = function (dialogElement) {
  var index = dialogStack.indexOf(dialogElement);
  var lastIndex = dialogStack.length - 1;
  return index === lastIndex;
};

FS.dialog.service.closeAllDialogs = function () {
  var reverseStack = [].concat(dialogStack).reverse();
  reverseStack.forEach(function (dialog) {
    dialog.close();
  });
};

FS.dialog.service.closeDialogAndAllChildren = function (dialogElement) {
  var reverseStack = [].concat(dialogStack).reverse();
  var index = reverseStack.indexOf(dialogElement);

  var animationToUseToClose = dialogElement.getAttribute('transition');
  reverseStack.some(function (dialog, dialogIndex) {
    if (dialogIndex <= index) {
      var animationToRestore = dialog.getAttribute('transition');
      if (animationToUseToClose) {
        dialog.setAttribute('transition', animationToUseToClose);
      }
      dialog.close();
      // Restsore the animation direction after the transition has finished
      if (animationToUseToClose) {
        setTimeout(function () {
          dialog.setAttribute('transition', animationToRestore);
        }, 300);
      }
    } else {
      return true;
    }
  });
};

FS.dialog.service.getStack = function () {
  return dialogStack;
};

FS.dialog.service.windowHasFocus = true;

if (!isImplemented()) {
  Node.prototype.getRootNode = getRootNode;
}

function isImplemented () {
  return Object.prototype.hasOwnProperty.call(Node.prototype, 'getRootNode');
}

function isShadowRoot (node) {
  return typeof ShadowRoot === 'function' && node instanceof ShadowRoot;
}

function getRoot (node) {
  if (node.parentNode != null) {
    return getRoot(node.parentNode);
  }

  return node;
}

function getShadowIncludingRoot (node) {
  var root = getRoot(node);

  if (isShadowRoot(root)) {
    return getShadowIncludingRoot(root.host);
  }

  return root;
}

// Node getRootNode(optional GetRootNodeOptions options);

/**
 * Returns the context object’s shadow-including root if options’s composed is true.
 * Returns the context object’s root otherwise.
 *
 * The root of an object is itself, if its parent is null, or else it is the root of its parent.
 *
 * The shadow-including root of an object is its root’s host’s shadow-including root,
 * if the object’s root is a shadow root, and its root otherwise.
 *
 * https://dom.spec.whatwg.org/#dom-node-getrootnode
 *
 * @memberof Node.prototype
 * @param {!Object} [opt = {}] - Options.
 * @param {!boolean} [opt.composed] - See above description.
 * @returns {!Node} The root node.
 */
function getRootNode (opt) {
  var composed = typeof opt === 'object' && Boolean(opt.composed);

  return composed ? getShadowIncludingRoot(this) : getRoot(this);
}

(function (window, document) {
  const fsDialogTemplate = document.createElement('template');
  fsDialogTemplate.setAttribute('style', 'display: none;');
  fsDialogTemplate.innerHTML = `
  <!-- 1. Since we're not using shadow DOM and can't use <slot> elements, we can only
          add siblings to the user nodes and cannot move their nodes (breaks binding
          for polymer and angular)
       2. Use inline svg so the color can be changed with the rest of the text inside
          the header -->
    <button class="fs-dialog__close" data-dialog-dismiss data-test-close>
      <svg aria-hidden="true" width='13' height='13' viewbox="0 0 13 13" preserveAspectRatio="xMidYMin"><g transform='translate(-1.000000, -1.000000)'><path d='M13 2L2 13M2 2L13 13' stroke='currentColor' stroke-width='2.5'/></g></svg>
    </button>
  `;

  const fsDialogBodyStyle = document.createElement('template');
  fsDialogBodyStyle.setAttribute('style', 'display: none;');
  fsDialogBodyStyle.innerHTML = `
    <!--
      This style will be appended to the body element when the first modal or anchored
      dialog is open.  When there is at least one modal open, the fs-modal-dialog-open
      class will be added to the body element.  When there is an anchored dialog open,
      the fs-anchored-dialog-open class will be added to the body element.
    -->
    <style id="fs-dialog-body-style">
        body.fs-modal-dialog-open,
        body.fs-dialog-keep-fullscreen {
          overflow: hidden !important;
        }

        @media screen and (max-width:480px),
          (max-height:480px) {
          body.fs-anchored-dialog-open {
            overflow: hidden !important;
          }
        }
    </style>
  `;

  const fsDialogStyles = document.createElement('template');
  fsDialogStyles.setAttribute('style', 'display: none;');
  fsDialogStyles.innerHTML = `
    <style data-fs-dialog>
      /*
       * 1. The display property cannot be animated so we need to use opacity and visibility
       *    to fade in
       *    @see https://stackoverflow.com/questions/3331353/transitions-on-the-display-property
       * 2. Delay the visibility property so we can see the dialog disappear
       *    @see https://codepen.io/matthewlein/pen/fvrLD
       * 3. Support a fixed modal header/footer and scrollable middle
       * 4. Temporary hack until fs-styles removes background image from fs-dialog__close
       * 5. Safari's default active button color seems to be white (activebuttontext)
       */
      fs-modeless-dialog,
      fs-modal-dialog,
      fs-anchored-dialog {
        background: #fff;
        border-radius: 4px;
        border-radius: var(--fs-border-radius, 4px);
        -webkit-filter: drop-shadow(0 0 7px rgba(0, 0, 0, 0.5));
        filter: drop-shadow(0 0 7px rgba(0, 0, 0, 0.5));
        display: flex; /* [3] */
        flex-direction: column;
        max-height: 100vh;
        max-width: 545px;
        opacity: 0;
        visibility: hidden;
        width: -webkit-fit-content;
        width: -moz-fit-content;
        width: fit-content;
      }

      .fs-dialog__mask {
        background: rgba(51, 51, 49, 0.8);
        bottom: 0;
        left: 0;
        opacity: 0;
        position: fixed;
        right: 0;
        top: 0;
        visibility: hidden;
      }

      fs-modeless-dialog:not([opened]),
      fs-modal-dialog:not([opened]),
      fs-anchored-dialog:not([opened]),
      .fs-dialog__mask:not([opened]) {
        pointer-events: none;
      }

      fs-modeless-dialog:not([no-transition]),
      fs-anchored-dialog:not([no-transition]) {
        transition: opacity 0.3s, visibility 0s linear 0.3s; /* [2] */
      }

      /* [1] */
      fs-modeless-dialog[opened],
      fs-modal-dialog[opened],
      fs-anchored-dialog[opened],
      .fs-dialog__mask[opened] {
        opacity: 1;
        visibility: visible;
      }

      fs-modeless-dialog[opened]:not([no-transition]),
      fs-anchored-dialog[opened]:not([no-transition]),
      .fs-dialog__mask[opened]:not([no-transition]) {
        transition: opacity 0.3s, visibility 0s linear;
      }

      fs-modal-dialog[opened] {
        transform: translate(-50%, -50%) scale(1);
      }

      fs-modal-dialog[opened]:not([no-transition]) {
        transition: opacity 0.3s, visibility 0s linear, transform 0.3s;
      }

      .fs-dialog__mask[keep-fullscreen] {
        display: none;
        transition: none;
      }

      .fs-dialog__mask:not([no-transition]) {
        transition: opacity 0.3s, visibility 0s linear 0.3s; /* [2] */
      }

      fs-anchored-dialog header,
      fs-modeless-dialog header,
      fs-modal-dialog header {
        /* border-bottom: 1px solid #ccc;
        border-bottom: 1px solid var(--fs-color-grey-border, #ccc); */
        border-radius: 4px 4px 0 0;
        border-radius: var(--fs-border-radius, 4px) var(--fs-border-radius, 4px) 0 0;
        flex-shrink: 0;
        padding: 15px 4rem 10px 15px;
        background-color: #fff;
        position: relative;
      }

      fs-anchored-dialog[no-close-button] header,
      fs-modeless-dialog[no-close-button] header,
      fs-modal-dialog[no-close-button] header {
        padding-right: 15px;
      }

      /* [4] */
      fs-anchored-dialog .fs-dialog__close,
      fs-modeless-dialog .fs-dialog__close,
      fs-modal-dialog .fs-dialog__close {
        background-image: none !important;
        -webkit-appearance: none;
        -webkit-touch-callout: none;
        background-color: transparent;
        background-position: center;
        background-repeat: no-repeat;
        border: none;
        box-shadow: 0 0 0 transparent;
        height: 48px;
        height: 4rem;
        line-height: 1;
        opacity: 1;
        padding: 0;
        position: absolute;
        right: 0;
        top: 0;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        width: 48px;
        width: 4rem;
        color: inherit; /* [5] */
        z-index: 2;
      }

      fs-anchored-dialog .fs-dialog__close:hover,
      fs-modeless-dialog .fs-dialog__close:hover,
      fs-modal-dialog .fs-dialog__close:hover {
        cursor: pointer;
        opacity: 1;
      }

      fs-anchored-dialog .fs-dialog__close:active svg,
      fs-modeless-dialog .fs-dialog__close:active svg,
      fs-modal-dialog .fs-dialog__close:active svg {
        opacity: 1;
        width: 11px;
        height: 11px;
      }

      /* When a dialog is inside another dialog, and its supposed to be hiding the close button on mobile, the display: none style gets overridden due to the selector for display: block being more specific because its inside a media query. */
      fs-modal-dialog[no-close-button][no-fullscreen-mobile] .fs-dialog__close,
      fs-anchored-dialog[no-close-button][no-fullscreen-mobile] .fs-dialog__close {
        display: none !important;
      }

      fs-modal-dialog[no-close-button]:not([keep-fullscreen]) .fs-dialog__close,
      fs-anchored-dialog[no-close-button]:not([keep-fullscreen]) .fs-dialog__close {
        display: none;
      }

      fs-anchored-dialog .fs-dialog__body,
      fs-modeless-dialog .fs-dialog__body,
      fs-modal-dialog .fs-dialog__body {
        flex-grow: 3;
        overflow-y: auto;
        padding: 15px;
        position: relative;
        background-color: #fff;
        z-index: 1;
      }

      fs-modal-dialog footer,
      fs-modeless-dialog footer,
      fs-anchored-dialog footer {
        background-color: #fff;

        /* background: #f4f4f4;
        background: var(--fs-color-grey-background-light, #f4f4f4); */
        border-radius: 0 0 4px 4px;
        border-radius: 0 0 var(--fs-border-radius, 4px) var(--fs-border-radius, 4px);

        /* border-top: 1px solid #ccc;
        border-top: 1px solid var(--fs-color-grey-border, #ccc); */
        flex-shrink: 0;
        padding: 10px 15px;
        position: relative;
      }

      /** FULLSCREEN ON MOBILE **/

      /********* CAVEAT *********/

      /** This isn't going to
        work on all dialogs
        who have parents who
        are going to contain
        an absolute child **/

      fs-modal-dialog[keep-fullscreen],
      fs-anchored-dialog[keep-fullscreen] {
        border-radius: 0;
        bottom: 0 !important;
        height: 100% !important;
        left: 0 !important;
        max-height: 100% !important;
        max-width: 100%;
        position: fixed;
        right: 0 !important;
        top: 0 !important;
        transform: translate(0, 0) !important;
        width: 100%;
      }

      /** Begin Mobile Transitions **/

      fs-anchored-dialog[transition][keep-fullscreen] {
        transition: visibility 0s linear 0.3s, opacity 0s linear 0.3s;
      }

      fs-anchored-dialog[transition][opened][keep-fullscreen] {
        transition: visibility 0s, opacity 0s;
      }

      fs-modal-dialog[transition="from-bottom"][keep-fullscreen],
      fs-anchored-dialog[transition="from-bottom"][keep-fullscreen] {
        top: 100% !important;
        transition: top 0.3s, visibility 0s linear 0.3s, opacity 0s linear 0.3s;
      }

      fs-modal-dialog[transition="from-bottom"][opened][keep-fullscreen],
      fs-anchored-dialog[transition="from-bottom"][opened][keep-fullscreen] {
        top: 0 !important;
        transition: top 0.3s;
      }

      fs-modal-dialog[transition="from-right"][keep-fullscreen],
      fs-anchored-dialog[transition="from-right"][keep-fullscreen] {
        left: 100% !important;
        transition: left 0.3s, visibility 0s linear 0.3s, opacity 0s linear 0.3s;
      }

      fs-modal-dialog[transition="from-right"][opened][keep-fullscreen],
      fs-anchored-dialog[transition="from-right"][opened][keep-fullscreen] {
        left: 0 !important;
        transition: left 0.3s;
      }

      /** End Mobile Transitions **/

      @media screen and (max-width:480px),
        (max-height:480px) {
        fs-anchored-dialog[no-close-button] header,
        fs-modeless-dialog[no-close-button] header,
        fs-modal-dialog[no-close-button] header {
          padding-right: 4rem;
        }

        fs-modal-dialog[no-close-button]:not([no-fullscreen-mobile]) .fs-dialog__close,
        fs-anchored-dialog[no-close-button]:not([no-fullscreen-mobile]) .fs-dialog__close {
          display: block;
        }

        fs-modal-dialog:not([no-fullscreen-mobile]),
        fs-anchored-dialog:not([no-fullscreen-mobile]) {
          border-radius: 0;
          bottom: 0 !important;
          height: 100% !important;
          left: 0 !important;
          max-height: 100% !important;
          max-width: 100%;
          position: fixed;
          right: 0 !important;
          top: 0 !important;
          transform: translate(0, 0) !important;
          width: 100%;
        }

        .fs-dialog__mask {
          display: none;
          transition: none;
        }

        /** Begin Mobile Transitions **/

        fs-anchored-dialog[transition]:not([no-fullscreen-mobile]) {
          transition: visibility 0s linear 0.3s, opacity 0s linear 0.3s;
        }

        fs-anchored-dialog[transition][opened]:not([no-fullscreen-mobile]) {
          transition: visibility 0s, opacity 0s;
        }

        fs-modal-dialog[transition="from-bottom"]:not([no-fullscreen-mobile]),
        fs-anchored-dialog[transition="from-bottom"]:not([no-fullscreen-mobile]) {
          top: 100% !important;
          transition: top 0.3s, visibility 0s linear 0.3s, opacity 0s linear 0.3s;
        }

        fs-modal-dialog[transition="from-bottom"][opened]:not([no-fullscreen-mobile]),
        fs-anchored-dialog[transition="from-bottom"][opened]:not([no-fullscreen-mobile]) {
          top: 0 !important;
          transition: top 0.3s;
        }

        fs-modal-dialog[transition="from-right"]:not([no-fullscreen-mobile]),
        fs-anchored-dialog[transition="from-right"]:not([no-fullscreen-mobile]) {
          left: 100% !important;
          transition: left 0.3s, visibility 0s linear 0.3s, opacity 0s linear 0.3s;
        }

        fs-modal-dialog[transition="from-right"][opened]:not([no-fullscreen-mobile]),
        fs-anchored-dialog[transition="from-right"][opened]:not([no-fullscreen-mobile]) {
          left: 0 !important;
          transition: left 0.3s;
        }

        /** End Mobile Transitions **/
      }
    </style>
  `;

  FS._registerTranslations({"de":{"_LRM_PKTAG439":"fs-dialog_1_146 - FULL-FILE","fs.shared.fsDialog.CLOSE":"Schließen"},"en":{"fs.shared.fsDialog.CLOSE":"Close"},"eo":{"fs.shared.fsDialog.CLOSE":"[Çļöšé--- П國カ내]"},"es":{"_LRM_PKTAG33":"fs-dialog_2_101 - FULL-FILE","fs.shared.fsDialog.CLOSE":"Cerrar"},"fr":{"_LRM_PKTAG930":"fs-dialog_1_102 - FULL-FILE","fs.shared.fsDialog.CLOSE":"Fermer"},"it":{"_LRM_PKTAG257":"fs-dialog_1_103 - FULL-FILE","fs.shared.fsDialog.CLOSE":"Chiudi"},"ja":{"_LRM_PKTAG68":"fs-dialog_1_104 - FULL-FILE","fs.shared.fsDialog.CLOSE":"閉じる"},"ko":{"_LRM_PKTAG569":"fs-dialog_1_105 - FULL-FILE","fs.shared.fsDialog.CLOSE":"닫기"},"pt":{"_LRM_PKTAG662":"fs-dialog_1_106 - FULL-FILE","fs.shared.fsDialog.CLOSE":"Fechar"},"ru":{"_LRM_PKTAG275":"fs-dialog_1_107 - FULL-FILE","fs.shared.fsDialog.CLOSE":"Закрыть"},"zh":{"_LRM_PKTAG645":"fs-dialog_1_108 - FULL-FILE","fs.shared.fsDialog.CLOSE":"關閉"}});

  var zIndex = 1990;
  var zIndexIncrement = 10;

  var attrTypeMap = {
    'dismiss-on-blur': 'boolean',
    'keep-fullscreen': 'boolean',
    'no-fullscreen-mobile': 'boolean',
    'opened': 'boolean'
  };
  var attrNameMap = {
    'dismiss-on-blur': 'dismissOnBlur',
    'keep-fullscreen': 'keepFullscreen',
    'no-fullscreen-mobile': 'noFullscreenMobile',
    'opened': 'opened'
  };
  var attrList = [
    'dismiss-on-blur',
    'keep-fullscreen',
    'no-fullscreen-mobile',
    'opened'
  ];

  class FSDialogBase extends HTMLElement {
    constructor () {
      super();

      this.keydownHandler = keydownHandler;
    }
    createdCallback () {
      this.keydownHandler = keydownHandler;
    }
    connectedCallback () {
      this.attachedCallback();
    }
    /**
     * Initialize the dialog, add events, and accessibility features. Should only change
     * the DOM on attached callback otherwise it breaks Polymer bindings.
     */
    appendStyles (template, selector, thisEl) {
      var root = thisEl.getRootNode();

      let clone = document.importNode(template.content, true);
      let styles = clone.querySelector('style');

      // // In polyfilled browsers there is no shadow DOM so global styles still style
      // // the "fake" shadow DOM. We need to test for truly native support so we know
      // // when to inject styles into the shadow DOM. The best way I've found to do that
      // // is to test the toString output of a shadowroot since `instanceof ShadowRoot`
      // // returns true when it's just a document-fragment in polyfilled browsers
      // // @see https://stackoverflow.com/questions/45068560/using-a-non-shadow-dom-custom-element-both-inside-and-outside-the-shadow-dom
      if (root.toString() === '[object ShadowRoot]' && !root.querySelector(selector)) {
        root.appendChild(styles);
      } else if (!document.head.querySelector(selector)) {
        document.head.appendChild(styles);
      }
    }

    attachedCallback (onOpenDialogFunction, onCloseDialogFunction) {
      this.appendStyles(fsDialogStyles, 'style[data-fs-dialog]', this);

      // initialize the attributes that were set before the component got upgraded.
      // This may not be needed anymore after webcomponents are native everywhere
      var that = this;
      attrList.forEach(function (attr) {
        that.attributeChangedCallback(attr, null, that.getAttribute(attr));
      });

      var clone = document.importNode(fsDialogTemplate.content, true);

      // selectors
      var closeEl = clone.querySelector('.fs-dialog__close');
      var bodyEl = this.querySelector('.fs-dialog__body');
      var headerEl = this.querySelector('header');
      var resolvePromise, rejectPromise;

      // set aria-label on close button for screen readers
      closeEl.setAttribute('aria-label', FS.i18n('fs.shared.fsDialog.CLOSE'));

      // move the close button into the header or as the first child of the dialog
      // (so it's first in the tab order)
      if (headerEl) {
        headerEl.appendChild(closeEl);
      } else {
        this.insertBefore(closeEl, this.firstChild);
      }

      // Add style node to document head
      if (!document.head.querySelector('#fs-dialog-body-style')) {
        let clone = document.importNode(fsDialogBodyStyle.content, true);
        let styles = clone.querySelector('style');
        document.head.appendChild(styles);
      }

      this.appendChild(clone);
      this.setAttribute('role', 'dialog');
      // a11yEnhancer.dialog(this); // eslint-disable-line

      // this._opened = false;
      this._focusoutHandler = focusoutHandler.bind(this);

      // open the dialog
      this.open = function (optionsObj) {
        if (this.doTimoutPromise) {
          // this is to help with touch devices and toggle.
          // Previous to this part of the function being written,
          // touch devices had a problem where when losing focus
          // due to clicking on the attachToElement the open function
          // was firing before the close function (since with focusout
          // the close function is happening inside a timeout). We
          // had to do some insantiy here do make a timeout happen
          // because this function needs to return a promise and
          // as soon as you do anything inside a setTimout, everything
          // inside of it is lost.
          this.doTimoutPromise = false;
          let resolveTimeoutPromise;
          var timeoutPromise = new Promise(function (resolve, reject) {
            resolveTimeoutPromise = resolve;
          }).then(() => {
            return this.open(optionsObj);
          });
          setTimeout(() => {
            resolveTimeoutPromise();
          }, 0);
          return timeoutPromise;
        }
        this.doTimoutPromise = true;
        var pendingPromise;

        try {
          optionsObj = optionsObj || {};
          // optionsObj example:
          // {
          //   focusBackElement: <element>
          // }

          // Do not open a dialog that is already opened
          if (this.opened) return this.pendingPromise;

          // If dialog was just closed by clicking on the attachToElement, don't reopen.
          if (this.attachedToElementClicked) {
            this.attachedToElementClicked = false;
            return this.pendingPromise;
          }

          pendingPromise = new Promise(function (resolve, reject) {
            resolvePromise = resolve;
            rejectPromise = reject;
          });

          // add dialog to the stack unless it is a modeless dialog
          if (!this.doNotUseInStack) {
            FS.dialog.service.addDialogToStack(this);
          }

          this.focusBackElement = optionsObj.focusBackElement;

          // allow multiple dialogs to be open at a time by incrementing z-index by
          // the order they were opened
          zIndex += zIndexIncrement;
          this.style.zIndex = zIndex;

          // call dialog-type specific open logic
          if (onOpenDialogFunction) onOpenDialogFunction.bind(this)(optionsObj);

          // This must happen after the onOpenDialogFunction because with modal dialogs
          // inert will restore the previous state of aria-hidden (true) so we must
          // remove the aria-hidden attribute after inert has finished
          this.removeAttribute('aria-hidden');

          // this triggers the css changes to show the dialog
          this.setAttribute('opened', '');

          // wait for the css animations to run in case a modal is hidden (display: none,
          // visibility: hidden, inert) as the browser will not focus a hidden element
          setTimeout(function () {
            if (!this.opened) return;
            // focus the dialog if no element has autofocus attribute
            if (!this.querySelector('[autofocus]')) {
              this.focus();
            } else {
              this.querySelector('[autofocus]').focus();
            }
          }.bind(this), 0);

          var className = this.tagName === 'FS-MODAL-DIALOG' ? 'fs-modal-dialog-open' : this.tagName === 'FS-ANCHORED-DIALOG' ? 'fs-anchored-dialog-open' : '';
          // don't add the class for anchored-dialogs that have opted out
          if (className && this.tagName === 'FS-ANCHORED-DIALOG' && this.noFullscreenMobile) className = '';
          if (className) document.body.classList.add(className);
          if (this.keepFullscreen) document.body.classList.add('fs-dialog-keep-fullscreen');

          // setup event listeners
          this.addEventListener('click', dialogClickHandler);
          this.addEventListener('keydown', keydownHandler);

          if (this.dismissOnBlur) {
            this.addEventListener('focusout', this._focusoutHandler, true);
          }

          // when the body of the dialog scrolls we need to allow keyboard users to
          // focus the scrolling content so they can use the up/down arrow keys
          // to scroll
          // @see https://stackoverflow.com/questions/4814398/how-can-i-check-if-a-scrollbar-is-visible
          // @see https://github.com/angular/material/issues/2961
          // @see https://github.com/miguelcobain/ember-paper/pull/393
          // TODO: in cases like the temple flyout this may actually just always need to be set since
          //       the dialog will change its size after it gets more data
          if (bodyEl && bodyEl.scrollHeight > bodyEl.clientHeight) {
            bodyEl.setAttribute('tabindex', 0);
          }

          // fire an event for the outside world to hear
          this.dispatchEvent(new Event('fs-dialog-open', {bubbles: true, composed: true}));
        } catch (err) {
          rejectPromise(err);
        }

        // return a promise that will resolve when the dialog is closed.
        this.pendingPromise = pendingPromise;
        return pendingPromise;
      };

      // close the dialog
      this.close = function (optionsObj) {
        // Do not close a dialog that is already closed
        if (!this.opened) return this.pendingPromise;

        // remove event listeners
        // consider reducing event listeners by putting them in the service
        if (this.dismissOnBlur) {
          this.removeEventListener('focusout', this._focusoutHandler, true);
        }
        // do these functions need to be bound to this/be added to this?
        this.removeEventListener('click', dialogClickHandler);
        this.removeEventListener('keydown', keydownHandler);

        // css to close the dialogs
        this.removeAttribute('opened');

        this.setAttribute('aria-hidden', true);

        // call dialog-type specific close logic
        if (onCloseDialogFunction) onCloseDialogFunction.bind(this)();

        zIndex -= zIndexIncrement;

        if (!this.cancelFocusback && this.tagName === 'FS-MODAL-DIALOG') {
          // this has a settimeout because of modal dialog's uninert needing to run before we can do the focusback
          setTimeout(function () {
            this.focusBackElement && this.focusBackElement.focus();
            this.cancelFocusback = false;
            this.focusBackElement = null;
          }.bind(this), 100);
        } else {
          if (!this.cancelFocusback) {
            this.focusBackElement && this.focusBackElement.focus();
          }
          this.cancelFocusback = false;
          this.focusBackElement = null;
        }

        // remove dialog from stack
        FS.dialog.service.removeDialogFromStack(this);

        // if there are no dialogs with the same tag name in the stack, remove the associated open class from the document body
        if (this.tagName === 'FS-MODAL-DIALOG' || this.tagName === 'FS-ANCHORED-DIALOG' || this.keepFullscreen) {
          var tagName = this.tagName;
          if (FS.dialog.service.getStack().filter(function (item) { return item.keepFullscreen; }).length === 0) {
            document.body.classList.remove('fs-dialog-keep-fullscreen');
          }
          if (FS.dialog.service.getStack().filter(function (item) { return item.tagName === tagName && !item.noFullscreenMobile; }).length === 0) {
            document.body.classList.remove(this.tagName === 'FS-MODAL-DIALOG' ? 'fs-modal-dialog-open' : this.tagName === 'FS-ANCHORED-DIALOG' ? 'fs-anchored-dialog-open' : '');
          }
        }

        // fire an event for the outside world to hear
        this.dispatchEvent(new Event('fs-dialog-close', {bubbles: true, composed: true}));

        resolvePromise();
        return this.pendingPromise;
      };

      this.closeAndCloseChildren = function () {
        FS.dialog.service.closeDialogAndAllChildren(this);
      };

      // start opened (needs to be done after adding the event listeners to open
      // otherwise it wont run any of that code)
      if (this.hasAttribute('opened')) {
        this.open();
      }

      // HACK for browsers that don't natively support custom elements. This
      // event will fire after our element is all set up and ready to use.
      // we can remove this when all browsers support custom elements natively,
      // but that will be a breaking change to our API.
      this.dispatchEvent(new Event('fs-dialog-ready', { bubbles: true, composed: true }));
      this.fsDialogReady = true;
    }

    static get observedAttributes () {
      return attrList;
    }
    /**
     * Set our attributes to be properties too
     */
    attributeChangedCallback (attr, oldValue, newValue) {
      return attrList.some(function (attributeName) {
        if (attr === attributeName) {
          if (attrTypeMap[attributeName] === 'boolean') {
            if (newValue !== undefined && newValue !== null) {
              this[attrNameMap[attributeName]] = true;
            } else {
              this[attrNameMap[attributeName]] = false;
            }
          } else {
            if (newValue !== undefined && newValue !== null) {
              this[attrNameMap[attributeName]] = newValue;
            } else {
              this[attrNameMap[attributeName]] = null;
            }
          }
          return true;
        }
      }.bind(this));
    }
  }

  /**
   * Determine when to close the dialog.
   */
  function dialogClickHandler (event) {
    // handle child elements of elements with these attributes
    var el = event.target;
    while (el !== this) {
      // add a value to the event
      // make this event fire with the escape key
      // consider making this a custom event
      if (el.hasAttribute('data-dialog-dismiss')) {
        this.dispatchEvent(new Event('fs-dialog-dismiss', {bubbles: true, composed: true}));

        // stop the event from propagating to parent fs-dialogs
        event.stopPropagation();
        this.close();
      }

      // confirming the dialog does not close it. allow the user to determine
      // what to do with the modal
      if (el.hasAttribute('data-dialog-confirm')) {
        this.dispatchEvent(new Event('fs-dialog-confirm', {bubbles: true, composed: true}));

        // stop the event from propagating to parent fs-dialogs
        event.stopPropagation();
      }

      if (el.parentElement) {
        el = el.parentElement;
      } else {
        // If `el.parentElement` is `null`, that means the target
        // element or one of it's parents was removed from the dom which
        // will cause the dialog to lose focus and close. This will reset
        // the target and focus, keeping the dialog open.
        el = this;
        this.focus();
      }
    }
  }

  function windowFocusListener (event) {
    FS.dialog.service.windowHasFocus = true;
  }
  function windowBlurListener (event) {
    FS.dialog.service.windowHasFocus = false;
  }
  function focusoutHandler (event) {
    var dialog = this;
    var dialogContainedRelatedTarget;
    var reverseStack;
    window.removeEventListener('focus', dialog._focusoutHandler);
    // use setTimout so that we get the correct document.activeElement
    // TODO: look into using the related target instead of activeElement if possible
    if (FS.dialog.service.dialogIsOnTop(dialog)) {
      // don't close if a node loses focus from dissapearing.
      var target = event.composedPath()[0];
      var targetDisappeared = (!target.offsetHeight && !target.offsetWidth) || target.style.visibility === 'hidden';
      if (targetDisappeared) {
        setTimeout(function () {
          var root = dialog.getRootNode();
          if (!dialog.contains(root.activeElement)) dialog.focus();
        }, 0);
      } else {
        // don't close if a node doesn't get focus because it dissapeared
        if (event.relatedTarget && dialog.contains(event.relatedTarget)) dialogContainedRelatedTarget = true;
        setTimeout(function () {
          // Don't do anything if somehow the dialog was already closed
          if (!dialog.opened) return;
          var root = dialog.getRootNode();
          var activeElement = root.activeElement || document.activeElement;
          if (!FS.dialog.service.windowHasFocus) {
            // listen for when the window does get focus and run this function again
            window.addEventListener('focus', dialog._focusoutHandler);
          } else if (!dialog.contains(activeElement)) {
            // cascade down stack until we hit a dialog that has the active element or does not have click away
            reverseStack = [].concat(FS.dialog.service.getStack()).reverse();
            var originalDialog = dialog;
            reverseStack.some(function (dialog) {
              root = dialog.getRootNode();
              activeElement = root.activeElement || activeElement;
              // This does not work in firefox 59 as of 2018-04-19 (april 2018) because the
              // active element is always the document.body at this point for some reason
              dialog.attachedToElementClicked = ((dialog.attachToElement && dialog.attachToElement.contains(dialog.attachToElement.getRootNode().activeElement)) || (dialog.focusBackElement && dialog.focusBackElement.contains(dialog.focusBackElement.getRootNode().activeElement)));
              if (dialog.dismissOnBlur && !dialog.contains(activeElement)) {
                dialog.cancelFocusback = true;
                // don't close if a node doesn't get focus because it dissapeared
                if (dialogContainedRelatedTarget && dialog === originalDialog) {
                  dialog.focus();
                  return true;
                }
                dialog.close();
              } else {
                return true;
              }
            });
          }
        }, 0);
      }
    }
  }

  /**
   * Check for events that should close the dialog.
   * @param {Event} e
   */
  function keydownHandler (event) {
    if (event.which === 27) {
      // 27 is the code for the escape key
      this.dispatchEvent(new Event('fs-dialog-dismiss', {bubbles: true, composed: true}));
      this.close();
    } else if (this.tagName !== 'FS-MODELESS-DIALOG' && event.which === 9) {
      // catches tab key

      var focusableChildren = getFocusableChildren(this);

      // If there are no focusable children in the dialog, prevent tabbing through the rest
      // of the document before clearing focus on the dialog
      if (!focusableChildren.length) return event.preventDefault();

      var focusedItemIndex;

      if (event.target === this) {
        // the dialog is focusable, and is not technically its own child, so we need to manually set it to be the "first" item
        focusedItemIndex = 0;
      } else {
        // This line is required due to how the Shadow DOM polyfill wraps elements
        // (See: https://github.com/webcomponents/webcomponentsjs#element-wrapping--unwrapping-limitations-)
        let composedTarget = event.target;
        while (composedTarget.hasAttribute('focusable-component')) {
          composedTarget = composedTarget.shadowRoot ? composedTarget.shadowRoot.activeElement : composedTarget.activeElement;
        }
        focusedItemIndex = focusableChildren.indexOf(composedTarget) >= 0 ? focusableChildren.indexOf(composedTarget) : focusableChildren.indexOf(window.ShadowDOMPolyfill && window.ShadowDOMPolyfill.wrap ? window.ShadowDOMPolyfill.wrap(document.activeElement) : document.activeElement);
      }

      if (event.shiftKey && focusedItemIndex === 0) {
        focusableChildren[focusableChildren.length - 1].focus();
        event.preventDefault();
      } else if (!event.shiftKey && focusedItemIndex === focusableChildren.length - 1) {
        focusableChildren[0].focus();
        event.preventDefault();
      }
    }

    function getFocusableChildren (node) {
      var focusableElementsSelector = ['a[href]:not([tabindex="-1"])', 'area[href]:not([tabindex="-1"])', 'input:not([disabled]):not([tabindex="-1"])', 'select:not([disabled]):not([tabindex="-1"])', 'textarea:not([disabled]):not([tabindex="-1"])', 'button:not([disabled]):not([tabindex="-1"])', 'iframe:not([tabindex="-1"])', 'object:not([tabindex="-1"])', 'embed:not([tabindex="-1"])', '*[tabindex]:not([tabindex="-1"])', '*[contenteditable]:not([tabindex="-1"])', '[focusable-component]'];

      // filter out any elements that are not visible
      var focusableElements = Array.prototype.filter.call(node.querySelectorAll(focusableElementsSelector.join(',')), function (child) {
        return !!(child.offsetWidth || child.offsetHeight || child.getClientRects().length);
      });
      // get the children of anything that was labeled as a focusable-component and loop through its focusable children

      var focusableComponents = node.querySelectorAll('[focusable-component]');
      if (focusableComponents) {
        focusableComponents.forEach((component) => {
          if (focusableElements.indexOf(component) < 0) return;

          let componentChildren = [];
          if (component.shadowRoot) {
            componentChildren = getFocusableChildren(component.shadowRoot);
          }
          focusableElements.splice(focusableElements.indexOf(component), 1, ...componentChildren);
        });
      }

      return focusableElements;
    }
  }

  // keep track of if the window has focus or not
  window.addEventListener('focus', windowFocusListener);
  window.addEventListener('blur', windowBlurListener);

  FS.dialog.baseDialogComponent = FSDialogBase;
})(window, document);
