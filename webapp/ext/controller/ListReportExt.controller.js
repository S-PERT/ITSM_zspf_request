/* global Promise */
sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/mdc/p13n/StateUtil",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "zsp/itsm/zspfrequest/ext/controller/ListReportExt"
], function (ControllerExtension, StateUtil, Filter, FilterOperator, FilterHandler) {
    "use strict";

    var sOperatorName = FilterHandler.OPERATOR_NAME;

    // 외부 앱(Cross-App Navigation)에서 진입 시 유지할 필터 (화이트리스트)
    var aAllowedFilters = ["Custno", "CustomFilterProMngName"];

    function isCrossAppNavigation() {
        var sHash = (window.location && window.location.hash) || "";
        return sHash.indexOf("sap-xapp-state") !== -1;
    }

    function isAllowed(sKey) {
        // $editState 등 FE 내부 필터는 유지
        return sKey.charAt(0) === "$" || aAllowedFilters.indexOf(sKey) !== -1;
    }

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

    function restrictFilterBar(oFilterBar) {
        return StateUtil.retrieveExternalState(oFilterBar).then(function (oState) {
            var mFilter = (oState && oState.filter) || {};
            var mDelta = {};
            var aItems = [];
            Object.keys(mFilter).forEach(function (sKey) {
                if (!isAllowed(sKey) && mFilter[sKey] && mFilter[sKey].length) {
                    // delta 모드: filtered:false 로 조건 제거
                    mDelta[sKey] = mFilter[sKey].map(function (oCond) {
                        return Object.assign({}, oCond, { filtered: false });
                    });
                    aItems.push({ name: sKey, visible: false });
                }
            });
            if (!Object.keys(mDelta).length) {
                return false;
            }
            return StateUtil.applyExternalState(oFilterBar, { filter: mDelta, items: aItems }).then(function () {
                return true;
            });
        });
    }

    function attachGridRowNavigation(oController) {
        var oView = oController.base.getView();
        var oExtensionAPI = oController.base.getExtensionAPI();
        if (!oView || !oExtensionAPI || !oExtensionAPI.routing) {
            return;
        }

        function doAttach(oInnerTable) {
            if (!oInnerTable || oInnerTable._bRowNavAttached) {
                return;
            }
            oInnerTable._bRowNavAttached = true;

            oInnerTable.attachCellClick(function (oEvent) {
                // 1. 행 선택(체크박스) 컬럼 클릭 시 상세 이동 방지
                var iColIndex = oEvent.getParameter("columnIndex");
                if (iColIndex === undefined || iColIndex === null || iColIndex < 0) {
                    return;
                }

                // 2. 내부 버튼, 링크 등 상호작용 요소 클릭 제외
                var oDomEvent = window.event;
                var oTarget = (oDomEvent && oDomEvent.target) || null;
                if (oTarget && (oTarget.closest("button") ||
                    oTarget.closest(".sapMBtn") ||
                    oTarget.closest(".sapMLnk") ||
                    oTarget.closest(".sapMCb") ||
                    oTarget.closest(".sapUiTableColResizer"))) {
                    return;
                }

                var oCellControl = oEvent.getParameter("cellControl");
                if (oCellControl && (oCellControl.isA("sap.m.Button") || oCellControl.isA("sap.m.Link") || oCellControl.isA("sap.m.CheckBox"))) {
                    return;
                }

                // 3. Object Page로 이동
                var oContext = oEvent.getParameter("rowBindingContext");
                if (oContext) {
                    oExtensionAPI.routing.navigate(oContext);
                }
            });
        }

        // 1) 이미 렌더링된 sap.ui.table.Table 검색
        var aTables = oView.findAggregatedObjects(true, function (o) {
            return o && o.isA && o.isA("sap.ui.table.Table");
        });
        if (aTables && aTables.length) {
            aTables.forEach(doAttach);
        }

        // 2) sap.ui.mdc.Table 초기화 대기 후 inner table 연결
        var aMdcTables = oView.findAggregatedObjects(true, function (o) {
            return o && o.isA && o.isA("sap.ui.mdc.Table");
        });
        if (aMdcTables && aMdcTables.length) {
            aMdcTables.forEach(function (oMdcTable) {
                if (oMdcTable.initialized) {
                    oMdcTable.initialized().then(function () {
                        var oInner = oMdcTable.getAggregation("_content") || (typeof oMdcTable._getTable === "function" && oMdcTable._getTable());
                        if (oInner && oInner.isA && oInner.isA("sap.ui.table.Table")) {
                            doAttach(oInner);
                        }
                    }).catch(function () {});
                }
            });
        }
    }

    function addCandidate(aList, sVal) {
        var sClean = (sVal || "").replace(/\s+/g, "");
        if (sClean && aList.indexOf(sClean) === -1) {
            aList.push(sClean);
        }
    }

    function getLogonUserCandidates() {
        if (!window.sap || !sap.ushell || !sap.ushell.Container || typeof sap.ushell.Container.getServiceAsync !== "function") {
            return Promise.resolve([]);
        }
        return sap.ushell.Container.getServiceAsync("UserInfo").then(function (oUserInfo) {
            if (!oUserInfo) {
                return [];
            }
            var sFirst = (typeof oUserInfo.getFirstName === "function" && oUserInfo.getFirstName()) || "";
            var sLast = (typeof oUserInfo.getLastName === "function" && oUserInfo.getLastName()) || "";
            var sFull = (typeof oUserInfo.getFullName === "function" && oUserInfo.getFullName()) || "";

            var aCandidates = [];
            if (sLast && sFirst) {
                addCandidate(aCandidates, sLast + sFirst);
            }
            if (sFull) {
                addCandidate(aCandidates, sFull);
                var sCleanFull = sFull.replace(/\s+/g, "");
                if (sCleanFull.length === 3) {
                    addCandidate(aCandidates, sCleanFull.charAt(2) + sCleanFull.substring(0, 2));
                }
            }
            if (sFirst && sLast) {
                addCandidate(aCandidates, sFirst + sLast);
            }
            return aCandidates;
        }).catch(function (err) {
            // eslint-disable-next-line no-console
            console.warn("ListReportExt: Failed to get UserInfo:", err);
            return [];
        });
    }

    function verifyOperManager(oModel, aCandidates) {
        if (!aCandidates || !aCandidates.length) {
            return Promise.resolve(null);
        }
        return new Promise(function (resolve) {
            try {
                var aFilters = aCandidates.map(function (sName) {
                    return new Filter("Mngname", FilterOperator.EQ, sName);
                });
                var oCombinedFilter = aFilters.length > 1 ? new Filter({ filters: aFilters, and: false }) : aFilters[0];

                var oListBinding = oModel.bindList("/OperManager", null, null, [oCombinedFilter], {
                    $top: 1
                });
                oListBinding.requestContexts(0, 1).then(function (aContexts) {
                    if (aContexts && aContexts.length > 0) {
                        var oContext = aContexts[0];
                        var oData = (typeof oContext.getObject === "function" && oContext.getObject()) ||
                                    (typeof oContext.getProperty === "function" && { Mngname: oContext.getProperty("Mngname") });
                        var sMatchedName = (oData && oData.Mngname) || aCandidates[0];
                        resolve(sMatchedName);
                    } else {
                        resolve(null);
                    }
                }).catch(function (err) {
                    // eslint-disable-next-line no-console
                    console.warn("ListReportExt: OperManager verification failed:", err);
                    resolve(null);
                });
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("ListReportExt: OperManager check exception:", e);
                resolve(null);
            }
        });
    }

    function setCustomFilterInputValue(oView, sValue) {
        if (!oView || !sValue) {
            return;
        }
        var aInputs = oView.findAggregatedObjects(true, function (c) {
            return c && c.isA && c.isA("sap.m.Input") && c.getId && c.getId().indexOf("CustomFilterProMngNameInput") !== -1;
        });
        if (aInputs && aInputs.length > 0) {
            aInputs.forEach(function (oInput) {
                if (oInput.getValue() !== sValue) {
                    oInput.setValue(sValue);
                }
            });
        }
    }

    var ListReportExt = ControllerExtension.extend("zsp.itsm.zspfrequest.ext.controller.ListReportExt", {
        override: {
            onInit: function () {
                this._bCleaned = false;
                this._bDefaultFilterApplied = false;
                this._pMatchedManagerName = null;
                this._sDefaultManagerName = null;
                this._hookViewStateSelectionVariant();
            },
            viewState: {
                onBeforeStateApplied: function (aPromises) {
                    this._hookViewStateSelectionVariant();
                    if (!this._pMatchedManagerName) {
                        this._pMatchedManagerName = this._resolveDefaultManagerName();
                        if (aPromises && Array.isArray(aPromises)) {
                            aPromises.push(this._pMatchedManagerName);
                        }
                    }
                },
                onAfterStateApplied: function (aPromises) {
                    var that = this;
                    this._cleanup();
                    if (!this._bDefaultFilterApplied) {
                        var oFallbackPromise = this._applyDefaultFilterBeforeSearch().then(function (bApplied) {
                            if (bApplied) {
                                var oFilterBar = findFilterBar(that.base.getView());
                                if (oFilterBar && typeof oFilterBar.triggerSearch === "function") {
                                    return oFilterBar.triggerSearch();
                                }
                            }
                            return null;
                        });
                        if (aPromises && Array.isArray(aPromises)) {
                            aPromises.push(oFallbackPromise);
                        }
                    } else if (this._sDefaultManagerName) {
                        setCustomFilterInputValue(this.base.getView(), this._sDefaultManagerName);
                    }
                }
            },
            onAfterRendering: function () {
                var that = this;
                attachGridRowNavigation(that);
                setTimeout(function () {
                    attachGridRowNavigation(that);
                }, 500);

                if (that._sDefaultManagerName) {
                    setCustomFilterInputValue(that.base.getView(), that._sDefaultManagerName);
                }
            }
        },

        _hookViewStateSelectionVariant: function () {
            var that = this;
            var oViewState = that.base && that.base.viewState;
            if (!oViewState || oViewState._bCustomDefaultHooked || typeof oViewState._applySelectionVariant !== "function") {
                return;
            }
            oViewState._bCustomDefaultHooked = true;
            var fnOrigApplySV = oViewState._applySelectionVariant;
            oViewState._applySelectionVariant = function () {
                var aArgs = arguments;
                return Promise.resolve(fnOrigApplySV.apply(this, aArgs)).then(function (vResult) {
                    return that._applyDefaultFilterBeforeSearch().then(function () {
                        return vResult;
                    });
                });
            };
        },

        _resolveDefaultManagerName: function () {
            var that = this;
            return getLogonUserCandidates().then(function (aCandidates) {
                if (!aCandidates || !aCandidates.length) {
                    return null;
                }
                var oView = that.base.getView();
                var oModel = oView.getModel() || (that.base.getAppComponent && that.base.getAppComponent().getModel());
                if (!oModel || typeof oModel.bindList !== "function") {
                    // eslint-disable-next-line no-console
                    console.warn("ListReportExt: ODataModel not ready for OperManager check.");
                    return null;
                }
                return verifyOperManager(oModel, aCandidates);
            }).catch(function (err) {
                // eslint-disable-next-line no-console
                console.warn("ListReportExt: Error resolving default manager name:", err);
                return null;
            });
        },

        _applyDefaultFilterBeforeSearch: function () {
            var that = this;
            if (that._bDefaultFilterApplied) {
                return Promise.resolve(false);
            }
            that._bDefaultFilterApplied = true;

            var oView = that.base.getView();
            var oFilterBar = findFilterBar(oView);
            var oExtensionAPI = that.base.getExtensionAPI();

            var pCleanup = Promise.resolve();
            if (!that._bCleaned && isCrossAppNavigation() && oFilterBar) {
                that._bCleaned = true;
                pCleanup = restrictFilterBar(oFilterBar).catch(function () {
                    return false;
                });
            }

            var pMatched = that._pMatchedManagerName || that._resolveDefaultManagerName();

            return Promise.all([pCleanup, pMatched]).then(function (aResults) {
                var sMatchedName = aResults[1];
                if (!sMatchedName || !oFilterBar) {
                    return false;
                }

                // 사용자가 저장한 변형(Variant)이 적용된 경우 기본값으로 덮어쓰지 않음
                var oVM = oView.byId("fe::PageVariantManagement");
                if (oVM && typeof oVM.getCurrentVariantKey === "function" && typeof oVM.getStandardVariantKey === "function") {
                    var sCurrentKey = oVM.getCurrentVariantKey();
                    var sStandardKey = oVM.getStandardVariantKey();
                    if (sCurrentKey && sStandardKey && sCurrentKey !== sStandardKey) {
                        return false;
                    }
                }

                return StateUtil.retrieveExternalState(oFilterBar).then(function (oState) {
                    var mFilter = (oState && oState.filter) || {};
                    var aExisting = mFilter.CustomFilterProMngName;
                    if (aExisting && aExisting.length > 0) {
                        // URL 파라미터나 변형으로 이미 필터 값이 들어온 경우 덮어쓰지 않음
                        return false;
                    }

                    that._sDefaultManagerName = sMatchedName;

                    var pSetFilter;
                    if (oExtensionAPI && typeof oExtensionAPI.setFilterValues === "function") {
                        pSetFilter = oExtensionAPI.setFilterValues("CustomFilterProMngName", sOperatorName, sMatchedName);
                    } else {
                        pSetFilter = StateUtil.applyExternalState(oFilterBar, {
                            filter: {
                                CustomFilterProMngName: [
                                    { operator: sOperatorName, values: [sMatchedName] }
                                ]
                            }
                        });
                    }

                    return Promise.resolve(pSetFilter).then(function () {
                        setCustomFilterInputValue(oView, sMatchedName);
                        return true;
                    });
                });
            }).catch(function (err) {
                // eslint-disable-next-line no-console
                console.warn("ListReportExt: Failed to apply default manager filter:", err);
                return false;
            });
        },

        _cleanup: function () {
            if (this._bCleaned || !isCrossAppNavigation()) {
                return;
            }
            var oFilterBar = findFilterBar(this.base.getView());
            if (!oFilterBar) {
                return;
            }
            this._bCleaned = true;
            restrictFilterBar(oFilterBar).then(function (bChanged) {
                if (bChanged && typeof oFilterBar.triggerSearch === "function") {
                    oFilterBar.triggerSearch();
                }
            }).catch(function (e) {
                // eslint-disable-next-line no-console
                console.error("ListReportExt cleanup error:", e);
            });
        }
    });

    ListReportExt.filterProMngName = FilterHandler.filterProMngName;
    ListReportExt.onFilterSubmit = FilterHandler.onFilterSubmit;

    return ListReportExt;
});
