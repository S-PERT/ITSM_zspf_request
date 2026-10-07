sap.ui.define([
    "sap/ui/core/Control",
    "zsp/itsm/zspfrequest/ext/controller/tiptap"
], function (Control, Runtime) {
    "use strict";
    return Control.extend("zsp.itsm.zspfrequest.ext.controller.TiptapEditor", {
        metadata: {
            properties: {
                value: { type: "string", defaultValue: "" },
                editable: { type: "boolean", defaultValue: false }
            }
        },
        renderer: {
            apiVersion: 2,
            render: function (rm, control) {
                rm.openStart("div", control).class("cm-editor");
                if (!control.getEditable()) { rm.class("cm-editor-readonly"); }
                rm.openEnd();
                rm.openStart("div", control.getId() + "-host").openEnd().close("div");
                rm.close("div");
            }
        },
        onBeforeRendering: function () {
            this._destroyEditor();
        },
        onAfterRendering: function () {
            this._runtime = Runtime.mount(this.getDomRef("host"), {
                value: this.getValue(),
                editable: this.getEditable(),
                onChange: function (html) {
                    // Update OData only on real edits, without recreating the editor.
                    this.setProperty("value", html, true);
                }.bind(this)
            });
        },
        _destroyEditor: function () {
            if (this._runtime) {
                this._runtime.destroy();
                this._runtime = null;
            }
        },
        exit: function () {
            this._destroyEditor();
        }
    });
});