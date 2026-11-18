sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/mdc/condition/FilterOperatorUtil",
    "sap/ui/mdc/condition/Operator"
], function (Filter, FilterOperator, FilterOperatorUtil, Operator) {
    "use strict";

    var sOperatorName = "zsp.itsm.zspfrequest.ext.controller.ListReportExt.filterProMngName";

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

    var oHandler = {
        OPERATOR_NAME: sOperatorName,

        /**
         * Custom operator for filterValues> binding in sap.fe
         * @param {string} sValue User input
         * @returns {sap.ui.model.Filter|null} UI5 Filter instance or null
         */
        filterProMngName: function (sValue) {
            if (!sValue || !String(sValue).trim()) {
                return null;
            }
            return new Filter({
                path: "_Promanager",
                operator: FilterOperator.Any,
                variable: "p",
                condition: new Filter("p/Mngname", FilterOperator.Contains, String(sValue).trim())
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

    // Register custom operator synchronously in FilterOperatorUtil so setFilterValues / StateUtil works immediately
    if (FilterOperatorUtil && Operator && !FilterOperatorUtil.getOperator(sOperatorName)) {
        FilterOperatorUtil.addOperator(new Operator({
            filterOperator: "",
            tokenFormat: "",
            name: sOperatorName,
            valueTypes: ["self"],
            tokenParse: "^(.*)$",
            format: function (oValue) {
                return Array.isArray(oValue.values) && oValue.values.length ? oValue.values[0] : oValue.values;
            },
            parse: function (vText, oType, sDisplayFormat, bDefaultOperator) {
                if (typeof vText === "object") {
                    if (vText.operator !== sOperatorName) {
                        throw new Error("not matching operator");
                    }
                    return vText.values;
                }
                return Operator.prototype.parse.apply(this, [vText, oType, sDisplayFormat, bDefaultOperator]);
            },
            getModelFilter: function (oCondition) {
                var vVal = Array.isArray(oCondition.values) && oCondition.values.length ? oCondition.values[0] : oCondition.values;
                return oHandler.filterProMngName(vVal);
            }
        }));
    }

    return oHandler;
});
