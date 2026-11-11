sap.ui.define([], function () {
    "use strict";

    return {
        onNavigateToCustmaster: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            if (!oContext) {
                return;
            }
            var sCustno = oContext.getProperty("Custno");

            var oCrossAppNav = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService("CrossApplicationNavigation");
            if (oCrossAppNav) {
                oCrossAppNav.toExternal({
                    target: {
                        semanticObject: "ZSPF_CUSTMASTER",
                        action: "display"
                    },
                    params: {
                        "Custno": sCustno
                    }
                });
            }
        }
    };
});

