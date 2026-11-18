sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
    "use strict";

    function findFilterBar(oView) {
        var oFB = oView.byId("fe::FilterBar::Main");
        if (oFB) {
            return oFB;
        }
        var aFound = oView.findAggregatedObjects(true, function (c) {
            return c && c.isA && c.isA("sap.ui.mdc.FilterBar");
        });
        return aFound && aFound[0];
    }

    return {
        /**
         * Custom operator for filterValues> binding in sap.fe
         * @param {string} sValue User input
         * @returns {sap.ui.model.Filter|null} UI5 Filter instance or null
         */
        filterProMngName: function (sValue) {
            if (!sValue || !sValue.trim()) {
                return null;
            }
            return new Filter({
                path: "_Promanager",
                operator: FilterOperator.Any,
                variable: "p",
                condition: new Filter("p/Mngname", FilterOperator.Contains, sValue.trim())
            });
        },

        /**
         * Submit handler on Input control (Enter key press)
         * @param {sap.ui.base.Event} oEvent Event
         */
        onFilterSubmit: function (oEvent) {
            var oInput = oEvent.getSource();
            var oView = oInput;
            while (oView && !oView.isA("sap.ui.core.mvc.View")) {
                oView = oView.getParent();
            }
            if (oView) {
                var oFilterBar = findFilterBar(oView);
                if (oFilterBar && typeof oFilterBar.triggerSearch === "function") {
                    oFilterBar.triggerSearch();
                }
            }
        }
    };
});
