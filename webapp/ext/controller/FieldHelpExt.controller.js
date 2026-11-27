sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/m/Button",
    "sap/m/Popover",
    "sap/m/FormattedText",
    "sap/ui/layout/form/ColumnElementData"
], function (ControllerExtension, Button, Popover, FormattedText, ColumnElementData) {
    "use strict";

    // 필드 옆 도움말(popover) 대상: 필드명 → i18n 키 접두어 (<접두어>HelpTitle / <접두어>HelpText)
    var mFieldHelp = {
        Zlevel: "zlevel",
        ManHours: "manHours"
    };
    var sFormElementMarker = "::FormElement::DataField::";

    function getFieldName(sFormElementId) {
        var iPos = sFormElementId.lastIndexOf(sFormElementMarker);
        return iPos === -1 ? "" : sFormElementId.slice(iPos + sFormElementMarker.length);
    }

    /**
     * Adds a hint button next to each field listed in mFieldHelp.
     * The fields come from UI.Identification (form GeneralInfo); FE gives each form element the
     * stable id "...::FormElement::DataField::<Property>". Already attached fields are skipped.
     * @param {object} oController The controller extension
     */
    function attachFieldHelp(oController) {
        var oView = oController.base.getView();
        var aFormElements = oView.findAggregatedObjects(true, function (oControl) {
            return oControl.isA("sap.ui.layout.form.FormElement") && !oControl._bZspHelpAttached &&
                mFieldHelp.hasOwnProperty(getFieldName(oControl.getId()));
        });

        aFormElements.forEach(function (oFormElement) {
            var sKey = mFieldHelp[getFieldName(oFormElement.getId())];
            oFormElement._bZspHelpAttached = true;
            oFormElement.addField(new Button({
                icon: "sap-icon://hint",
                type: "Transparent",
                tooltip: "{i18n>fieldHelpTooltip}",
                layoutData: new ColumnElementData({ cellsSmall: 2, cellsLarge: 1 }),
                press: function (oEvent) {
                    oController._openFieldHelp(oEvent.getSource(), sKey);
                }
            }));
        });
    }

    return ControllerExtension.extend("zsp.itsm.zspfrequest.ext.controller.FieldHelpExt", {
        override: {
            // first display: the form is not there yet at onAfterBinding, so attach again once the page is ready
            onPageReady: function () {
                attachFieldHelp(this);
            },
            routing: {
                onAfterBinding: function () {
                    attachFieldHelp(this);
                }
            }
        },

        /**
         * Opens the help popover of a field next to its hint button (press again to close).
         * @param {sap.m.Button} oButton The hint button
         * @param {string} sKey The i18n key prefix of the field
         */
        _openFieldHelp: function (oButton, sKey) {
            if (!this._oFieldHelpPopover) {
                this._oFieldHelpText = new FormattedText().addStyleClass("sapUiSmallMargin");
                this._oFieldHelpPopover = new Popover({
                    placement: "Bottom",
                    contentWidth: "20rem",
                    content: [this._oFieldHelpText]
                });
                // dependent of the view: gets the i18n model and is destroyed with the view
                this.base.getView().addDependent(this._oFieldHelpPopover);
            }
            var oPopover = this._oFieldHelpPopover;
            if (oPopover.isOpen()) {
                oPopover.close();
                if (this._oFieldHelpButton === oButton) {
                    return;
                }
            }
            this._oFieldHelpButton = oButton;
            oPopover.bindProperty("title", "i18n>" + sKey + "HelpTitle");
            this._oFieldHelpText.bindProperty("htmlText", "i18n>" + sKey + "HelpText");
            oPopover.openBy(oButton);
        }
    });
});
