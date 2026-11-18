/* global Promise */
sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/mdc/p13n/StateUtil",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (ControllerExtension, StateUtil, Filter, FilterOperator) {
    "use strict";

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
            // 1. 성 + 이름 (한국어 표준: "권" + "순호" -> "권순호")
            if (sLast && sFirst) {
                var sLastFirst = (sLast + sFirst).replace(/\s+/g, "");
                if (sLastFirst && aCandidates.indexOf(sLastFirst) === -1) {
                    aCandidates.push(sLastFirst);
                }
            }
            // 2. FullName 공백 제거 (예: "순호 권" -> "순호권" 또는 "권 순호" -> "권순호")
            if (sFull) {
                var sCleanFull = sFull.replace(/\s+/g, "");
                if (sCleanFull && aCandidates.indexOf(sCleanFull) === -1) {
                    aCandidates.push(sCleanFull);
                }
                // 3글자 한국 이름 순서 반전 대비 ("순호권" -> "권순호")
                if (sCleanFull.length === 3) {
                    var sReversed = sCleanFull.charAt(2) + sCleanFull.substring(0, 2);
                    if (sReversed && aCandidates.indexOf(sReversed) === -1) {
                        aCandidates.push(sReversed);
                    }
                }
            }
            // 3. 이름 + 성 ("순호" + "권" -> "순호권")
            if (sFirst && sLast) {
                var sFirstLast = (sFirst + sLast).replace(/\s+/g, "");
                if (sFirstLast && aCandidates.indexOf(sFirstLast) === -1) {
                    aCandidates.push(sFirstLast);
                }
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
                this._bDefaultFilterInitialized = false;
            },
            viewState: {
                onBeforeStateApplied: function (aPromises) {
                    var that = this;
                    if (!that._bDefaultFilterInitialized) {
                        var oPromise = that._initDefaultManagerFilter();
                        if (aPromises && Array.isArray(aPromises)) {
                            aPromises.push(oPromise);
                        }
                    }
                },
                onAfterStateApplied: function () {
                    this._cleanup();
                    if (!this._bDefaultFilterInitialized) {
                        this._initDefaultManagerFilter();
                    }
                    if (this._sDefaultManagerName) {
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

                // onAfterStateApplied 가 호출되지 않는 버전 대비
                setTimeout(function () {
                    that._cleanup();
                    if (!that._bDefaultFilterInitialized) {
                        that._initDefaultManagerFilter();
                    }
                    if (that._sDefaultManagerName) {
                        setCustomFilterInputValue(that.base.getView(), that._sDefaultManagerName);
                    }
                }, 300);
            }
        },

        _applyDefaultManagerFilter: function (sMatchedName) {
            var that = this;
            if (!sMatchedName) {
                return;
            }
            that._sDefaultManagerName = sMatchedName;

            var oView = that.base.getView();
            var oFilterBar = findFilterBar(oView);
            var oExtensionAPI = that.base.getExtensionAPI();

            if (oExtensionAPI && typeof oExtensionAPI.setFilterValues === "function") {
                try {
                    oExtensionAPI.setFilterValues("CustomFilterProMngName", "EQ", sMatchedName);
                } catch (err1) {
                    try {
                        oExtensionAPI.setFilterValues("CustomFilterProMngName", sMatchedName);
                    } catch (err2) {
                        // eslint-disable-next-line no-console
                        console.warn("ListReportExt: setFilterValues failed:", err1, err2);
                    }
                }
            }

            if (oFilterBar) {
                StateUtil.applyExternalState(oFilterBar, {
                    filter: {
                        CustomFilterProMngName: [
                            { operator: "EQ", values: [sMatchedName] }
                        ]
                    }
                }).catch(function () {});
            }

            setCustomFilterInputValue(oView, sMatchedName);
        },

        _initDefaultManagerFilter: function () {
            var that = this;
            if (that._bDefaultFilterInitialized) {
                return Promise.resolve();
            }
            that._bDefaultFilterInitialized = true;

            return getLogonUserCandidates().then(function (aCandidates) {
                if (!aCandidates || !aCandidates.length) {
                    return null;
                }

                var oView = that.base.getView();
                var oFilterBar = findFilterBar(oView);

                var pState = oFilterBar ? StateUtil.retrieveExternalState(oFilterBar) : Promise.resolve(null);
                return pState.then(function (oState) {
                    var mFilter = (oState && oState.filter) || {};
                    var aExisting = mFilter.CustomFilterProMngName;
                    if (aExisting && aExisting.length > 0) {
                        // 저장된 변형이나 URL 파라미터로 이미 필터 값이 있음 -> 기본값 덮어쓰지 않음
                        return null;
                    }

                    var oModel = oView.getModel() || (that.base.getAppComponent && that.base.getAppComponent().getModel());
                    if (!oModel || typeof oModel.bindList !== "function") {
                        // eslint-disable-next-line no-console
                        console.warn("ListReportExt: ODataModel not ready for OperManager check.");
                        return null;
                    }

                    return verifyOperManager(oModel, aCandidates).then(function (sMatchedName) {
                        if (sMatchedName) {
                            that._applyDefaultManagerFilter(sMatchedName);
                        }
                        return null;
                    });
                });
            }).catch(function (err) {
                // eslint-disable-next-line no-console
                console.warn("ListReportExt: Error during default manager filter init:", err);
                return null;
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

    ListReportExt.filterProMngName = function (sValue) {
        if (!sValue || !sValue.trim()) {
            return null;
        }
        return new Filter({
            path: "_Promanager",
            operator: FilterOperator.Any,
            variable: "p",
            condition: new Filter("p/Mngname", FilterOperator.Contains, sValue.trim())
        });
    };

    ListReportExt.onFilterSubmit = function (oEvent) {
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
    };

    return ListReportExt;
});
