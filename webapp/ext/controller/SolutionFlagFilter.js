sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/mdc/condition/FilterOperatorUtil",
    "sap/ui/mdc/condition/Operator",
    "sap/ui/mdc/condition/Condition"
], function (Filter, FilterOperator, FilterOperatorUtil, Operator, Condition) {
    "use strict";

    /**
     * List report filter for SolutionFlag.
     * The standard filter field uses the property's value list, which is bound to the
     * customer (one row per customer and solution) for the object page. This filter lists
     * the distinct solution codes from the exposed SolutionFlag entity set instead.
     */
    var sOperatorName = "zsp.itsm.zspfrequest.ext.controller.SolutionFlagFilter.filterSolutionFlag";
    var oHandler;

    function splitKeys(vValue) {
        return String(vValue || "").split(",").map(function (sPart) {
            return sPart.trim();
        }).filter(Boolean);
    }

    function getConditionValue(vValues) {
        return Array.isArray(vValues) && vValues.length ? vValues[0] : vValues;
    }

    function findContentWrapper(oControl) {
        var oCur = oControl && oControl.getParent && oControl.getParent();
        while (oCur) {
            if (oCur.isA && oCur.isA("sap.fe.macros.controls.CustomFilterFieldContentWrapper")) {
                return oCur;
            }
            oCur = oCur.getParent && oCur.getParent();
        }
        return null;
    }

    function formatOperatorValue(oCondition) {
        var vVal = getConditionValue(oCondition && oCondition.values);
        return vVal === undefined || vVal === null ? "" : String(vVal);
    }

    function parseOperatorValue(vText, oType, sDisplayFormat, bDefaultOperator) {
        if (vText && typeof vText === "object") {
            if (vText.operator !== sOperatorName) {
                throw new Error("not matching operator");
            }
            return vText.values;
        }
        return Operator.prototype.parse.apply(this, [vText, oType, sDisplayFormat, bDefaultOperator]);
    }

    function getOperatorModelFilter(oCondition) {
        return oHandler.filterSolutionFlag(getConditionValue(oCondition && oCondition.values));
    }

    function ensureCustomOperatorRegistered() {
        var oOperator = FilterOperatorUtil.getOperator(sOperatorName);
        if (!oOperator) {
            // Operator throws in its constructor unless filterOperator or getModelFilter is passed here
            oOperator = new Operator({
                filterOperator: "",
                tokenText: "{0}",
                tokenFormat: "{0}",
                tokenParse: "^(.*)$",
                name: sOperatorName,
                valueTypes: ["self"],
                format: formatOperatorValue,
                parse: parseOperatorValue,
                getModelFilter: getOperatorModelFilter
            });
            FilterOperatorUtil.addOperator(oOperator);
        }
        if (oOperator._bZspPatched) {
            return oOperator;
        }
        oOperator.tokenText = "{0}";
        oOperator.tokenFormat = "{0}";
        oOperator.tokenParseRegExp = new RegExp("^(.*)$", "i");
        oOperator.test = function () {
            return true;
        };
        // format/parse/getModelFilter are getter-only properties; assigning them throws in strict mode
        var mOverwrites = {
            format: formatOperatorValue,
            parse: parseOperatorValue,
            getModelFilter: getOperatorModelFilter
        };
        Object.keys(mOverwrites).forEach(function (sMethodName) {
            if (oOperator[sMethodName] === mOverwrites[sMethodName]) {
                return;
            }
            if (typeof oOperator.overwrite === "function") {
                oOperator.overwrite(sMethodName, mOverwrites[sMethodName]);
            } else if (oOperator._oMethodOverwrites) {
                oOperator._oMethodOverwrites[sMethodName] = mOverwrites[sMethodName];
            }
        });
        oOperator._bZspPatched = true;
        return oOperator;
    }

    function syncSelectedKeys(oComboBox, sValue) {
        if (!oComboBox || !oComboBox.isA || !oComboBox.isA("sap.m.MultiComboBox")) {
            return;
        }
        var aKeys = splitKeys(sValue);
        var aCurrent = oComboBox.getSelectedKeys() || [];
        var bSame = aKeys.length === aCurrent.length && aKeys.every(function (sKey) {
            return aCurrent.indexOf(sKey) !== -1;
        });
        if (!bSame) {
            oComboBox.setSelectedKeys(aKeys);
        }
    }

    /**
     * Writes the selected keys into the custom filter field's conditions.
     * Conditions are set on the wrapper only; its binding carries them to the FilterBar.
     * @param {sap.m.MultiComboBox} oComboBox The MultiComboBox
     */
    function applySelectionToConditions(oComboBox) {
        var oWrapper = findContentWrapper(oComboBox);
        if (!oWrapper || typeof oWrapper.setConditions !== "function") {
            return;
        }
        var sJoined = (oComboBox.getSelectedKeys() || []).map(function (sKey) {
            return String(sKey).trim();
        }).filter(Boolean).join(",");
        if (sJoined) {
            ensureCustomOperatorRegistered();
            oWrapper.setConditions([Condition.createCondition(sOperatorName, [sJoined], null, null, "NotValidated")]);
        } else {
            oWrapper.setConditions([]);
        }
    }

    oHandler = {
        OPERATOR_NAME: sOperatorName,

        /**
         * Builds the model filter for the selected solution codes.
         * @param {string} sValue Comma separated solution codes
         * @returns {sap.ui.model.Filter} UI5 Filter instance
         */
        filterSolutionFlag: function (sValue) {
            var aKeys = splitKeys(sValue);
            if (!aKeys.length) {
                // FilterConverter skips "$search" filters; returning null would throw there
                return new Filter({
                    path: "$search",
                    operator: FilterOperator.EQ,
                    value1: ""
                });
            }
            var aFilters = aKeys.map(function (sKey) {
                return new Filter("SolutionFlag", FilterOperator.EQ, sKey);
            });
            return aFilters.length === 1 ? aFilters[0] : new Filter({
                filters: aFilters,
                and: false
            });
        },

        /**
         * Formatter of the read-only filterValue CustomData. Mirrors the filter state
         * (initial, variant, app state) into the MultiComboBox selection.
         * Called with the CustomData as "this".
         * @param {string} sValue Current filter value string
         * @returns {string} The unchanged value
         */
        formatFilterValue: function (sValue) {
            // filterValues> only reaches the CustomData once it sits inside the MultiComboBox,
            // so the parent is there whenever this formatter runs
            syncSelectedKeys(this && this.getParent && this.getParent(), sValue);
            return sValue;
        },

        /**
         * selectionFinish handler of the MultiComboBox
         * @param {sap.ui.base.Event} oEvent Event
         */
        onSelectionFinish: function (oEvent) {
            applySelectionToConditions(oEvent.getSource());
        }
    };

    // Register synchronously so setFilterValues / StateUtil can resolve the operator immediately
    ensureCustomOperatorRegistered();

    return oHandler;
});
