sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/mdc/condition/FilterOperatorUtil",
    "sap/ui/mdc/condition/Operator",
    "sap/m/Token",
    "sap/ui/base/ManagedObjectObserver"
], function (Filter, FilterOperator, FilterOperatorUtil, Operator, Token, ManagedObjectObserver) {
    "use strict";

    var sOperatorName = "zsp.itsm.zspfrequest.ext.controller.ListReportExt.filterProMngName";

    function findFilterBar(oView) {
        var oController = oView && oView.getController && oView.getController();
        if (oController && typeof oController._getFilterBarControl === "function") {
            var oMdcFB = oController._getFilterBarControl();
            if (oMdcFB) {
                return oMdcFB;
            }
        }
        var oFB = oView && oView.byId && oView.byId("fe::FilterBar::Main");
        if (oFB && oFB.isA && oFB.isA("sap.ui.mdc.FilterBar")) {
            return oFB;
        }
        if (oFB && typeof oFB.getContent === "function") {
            var oContent = oFB.getContent();
            if (oContent && oContent.isA && oContent.isA("sap.ui.mdc.FilterBar")) {
                return oContent;
            }
        }
        var aFound = oView ? oView.findAggregatedObjects(true, function (c) {
            return c && c.isA && c.isA("sap.ui.mdc.FilterBar");
        }) : [];
        return aFound && aFound[0];
    }

    function getFilterCustomData(oMultiInput) {
        var aCustomData = (oMultiInput && oMultiInput.getCustomData && oMultiInput.getCustomData()) || [];
        for (var i = 0; i < aCustomData.length; i++) {
            if (aCustomData[i].getKey && aCustomData[i].getKey() === "filterValue") {
                return aCustomData[i];
            }
        }
        return null;
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

    function triggerSearchFromControl(oControl) {
        var oView = oControl;
        while (oView && (!oView.isA || !oView.isA("sap.ui.core.mvc.View"))) {
            oView = oView.getParent && oView.getParent();
        }
        if (oView) {
            var oFilterBar = findFilterBar(oView);
            var oFilterBarAPI = oFilterBar && oFilterBar.getParent && oFilterBar.getParent();
            if (oFilterBarAPI && typeof oFilterBarAPI.triggerSearch === "function") {
                oFilterBarAPI.triggerSearch();
                return;
            }
            if (oFilterBar && typeof oFilterBar.triggerSearch === "function") {
                oFilterBar.triggerSearch();
            }
        }
    }

    function syncTokensFromValue(oMultiInput, sVal) {
        if (!oMultiInput || !oMultiInput.isA || !oMultiInput.isA("sap.m.MultiInput")) {
            return;
        }
        var aParts = String(sVal || "").split(",").map(function (sPart) {
            return sPart.trim();
        }).filter(Boolean);

        var aCurrentTokens = oMultiInput.getTokens() || [];
        var aCurrentKeys = aCurrentTokens.map(function (oTok) {
            return String(oTok.getKey() || oTok.getText() || "").trim();
        });

        var bSame = aParts.length === aCurrentKeys.length && aParts.every(function (sPart, idx) {
            return sPart === aCurrentKeys[idx];
        });
        if (bSame) {
            return;
        }

        oMultiInput._bSyncingTokens = true;
        try {
            oMultiInput.destroyTokens();
            aParts.forEach(function (sPart) {
                oMultiInput.addToken(new Token({
                    key: sPart,
                    text: sPart
                }));
            });
            oMultiInput.setValue("");
        } finally {
            oMultiInput._bSyncingTokens = false;
        }
    }

    function applyFilterValueFromMultiInput(oMultiInput, sJoined) {
        if (!oMultiInput) {
            return;
        }
        oMultiInput._bUpdatingFromTokens = true;
        try {
            var oCustomData = getFilterCustomData(oMultiInput);
            if (oCustomData && oCustomData.getValue() !== sJoined) {
                oCustomData.setValue(sJoined);
            }
            var oFilterValuesModel = oMultiInput.getModel("filterValues");
            if (oFilterValuesModel && typeof oFilterValuesModel.setProperty === "function") {
                oFilterValuesModel.setProperty("/CustomFilterProMngName", sJoined);
            }
            var oWrapper = findContentWrapper(oMultiInput);
            if (oWrapper && typeof oWrapper.updateConditionsByFilterValues === "function") {
                if (sJoined) {
                    oWrapper.updateConditionsByFilterValues({
                        operator: sOperatorName,
                        values: [sJoined]
                    }, sOperatorName);
                } else {
                    oWrapper.updateConditionsByFilterValues("");
                }
            }
        } finally {
            oMultiInput._bUpdatingFromTokens = false;
        }
    }

    function ensureMultiInputInitialized(oMultiInput) {
        if (!oMultiInput || oMultiInput._bCustomTokenInit || !oMultiInput.isA || !oMultiInput.isA("sap.m.MultiInput")) {
            return;
        }
        oMultiInput._bCustomTokenInit = true;

        oMultiInput.addValidator(function (oArgs) {
            var sText = String((oArgs && oArgs.text) || "").trim();
            if (!sText) {
                return null;
            }
            return new Token({
                key: sText,
                text: sText
            });
        });

        var oCustomData = getFilterCustomData(oMultiInput);
        if (oCustomData && ManagedObjectObserver) {
            var oObserver = new ManagedObjectObserver(function (oChanges) {
                if (oChanges.name === "value" && !oMultiInput._bUpdatingFromTokens) {
                    syncTokensFromValue(oMultiInput, oChanges.current);
                }
            });
            oObserver.observe(oCustomData, {
                properties: ["value"]
            });
            if (oCustomData.getValue()) {
                syncTokensFromValue(oMultiInput, oCustomData.getValue());
            }
        }

        oMultiInput.addEventDelegate({
            onBeforeRendering: function () {
                var oCD = getFilterCustomData(oMultiInput);
                if (oCD && !oMultiInput._bUpdatingFromTokens) {
                    syncTokensFromValue(oMultiInput, oCD.getValue());
                }
            },
            onsapfocusleave: function () {
                var sPending = String(oMultiInput.getValue() || "").trim();
                if (sPending) {
                    oMultiInput.addToken(new Token({
                        key: sPending,
                        text: sPending
                    }));
                    oMultiInput.setValue("");
                    var aTokens = oMultiInput.getTokens() || [];
                    var sJoined = aTokens.map(function (oTok) {
                        return String(oTok.getKey() || oTok.getText() || "").trim();
                    }).filter(Boolean).join(",");
                    applyFilterValueFromMultiInput(oMultiInput, sJoined);
                }
            },
            onsapenter: function () {
                var sPending = String(oMultiInput.getValue() || "").trim();
                if (sPending) {
                    oMultiInput.addToken(new Token({
                        key: sPending,
                        text: sPending
                    }));
                    oMultiInput.setValue("");
                    var aTokens = oMultiInput.getTokens() || [];
                    var sJoined = aTokens.map(function (oTok) {
                        return String(oTok.getKey() || oTok.getText() || "").trim();
                    }).filter(Boolean).join(",");
                    applyFilterValueFromMultiInput(oMultiInput, sJoined);
                }
                triggerSearchFromControl(oMultiInput);
            }
        });
    }

    var oHandler = {
        OPERATOR_NAME: sOperatorName,
        findFilterBar: findFilterBar,
        ensureMultiInputInitialized: ensureMultiInputInitialized,
        syncTokensFromValue: syncTokensFromValue,
        applyFilterValueFromMultiInput: applyFilterValueFromMultiInput,

        /**
         * Custom operator for filterValues> binding in sap.fe
         * @param {string} sValue User input
         * @returns {sap.ui.model.Filter|null} UI5 Filter instance or null
         */
        filterProMngName: function (sValue) {
            if (!sValue || !String(sValue).trim()) {
                return null;
            }
            var aParts = String(sValue).split(",").map(function (sPart) {
                return sPart.replace(/\s*\([^)]*\)\s*$/, "").trim();
            }).filter(Boolean);

            if (!aParts.length) {
                return null;
            }
            if (aParts.length === 1) {
                return new Filter({
                    path: "_Promanager",
                    operator: FilterOperator.Any,
                    variable: "p",
                    condition: new Filter("p/Mngname", FilterOperator.Contains, aParts[0])
                });
            }
            var aFilters = aParts.map(function (sPart) {
                return new Filter({
                    path: "_Promanager",
                    operator: FilterOperator.Any,
                    variable: "p",
                    condition: new Filter("p/Mngname", FilterOperator.Contains, sPart)
                });
            });
            return new Filter({
                filters: aFilters,
                and: false
            });
        },

        /**
         * Token update handler on MultiInput
         * @param {sap.ui.base.Event} oEvent Event
         */
        onTokenUpdate: function (oEvent) {
            var oMultiInput = oEvent.getSource();
            ensureMultiInputInitialized(oMultiInput);
            if (oMultiInput._bSyncingTokens) {
                return;
            }
            var aRemoved = oEvent.getParameter("removedTokens") || [];
            var aAdded = oEvent.getParameter("addedTokens") || [];
            var aActiveTokens = (oMultiInput.getTokens() || []).filter(function (oTok) {
                return aRemoved.indexOf(oTok) === -1;
            });
            aAdded.forEach(function (oTok) {
                if (aActiveTokens.indexOf(oTok) === -1) {
                    aActiveTokens.push(oTok);
                }
            });
            var sJoined = aActiveTokens.map(function (oTok) {
                return String(oTok.getKey() || oTok.getText() || "").trim();
            }).filter(Boolean).join(",");

            oMultiInput.setValue("");
            applyFilterValueFromMultiInput(oMultiInput, sJoined);
        },

        /**
         * Change handler on MultiInput
         * @param {sap.ui.base.Event} oEvent Event
         */
        onInputChange: function (oEvent) {
            var oMultiInput = oEvent.getSource();
            ensureMultiInputInitialized(oMultiInput);
            var sValue = String(oMultiInput.getValue() || "").trim();
            if (sValue) {
                oMultiInput.addToken(new Token({
                    key: sValue,
                    text: sValue
                }));
                oMultiInput.setValue("");
                var aTokens = oMultiInput.getTokens() || [];
                var sJoined = aTokens.map(function (oTok) {
                    return String(oTok.getKey() || oTok.getText() || "").trim();
                }).filter(Boolean).join(",");
                applyFilterValueFromMultiInput(oMultiInput, sJoined);
            }
        },

        /**
         * Submit handler on MultiInput control (Enter key press)
         * @param {sap.ui.base.Event} oEvent Event
         */
        onFilterSubmit: function (oEvent) {
            var oMultiInput = oEvent.getSource();
            ensureMultiInputInitialized(oMultiInput);
            triggerSearchFromControl(oMultiInput);
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
