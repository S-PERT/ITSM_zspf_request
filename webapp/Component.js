sap.ui.define(
    ["sap/fe/core/AppComponent"],
    function (Component) {
        "use strict";

        var aAuditFields = [
            "CreatedBy",
            "CreatedAt",
            "LastChangedBy",
            "LastChangedAt",
            "LocalCreatedAt",
            "LocalLastChangedAt",
            "LocalLastChangedBy"
        ];

        return Component.extend("zsp.itsm.zspfrequest.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                var oComponentData = this.getComponentData();
                if (oComponentData && oComponentData.startupParameters) {
                    aAuditFields.forEach(function (sKey) {
                        if (oComponentData.startupParameters[sKey]) {
                            delete oComponentData.startupParameters[sKey];
                        }
                    });
                }
                Component.prototype.init.apply(this, arguments);
            }
        });
    }
);