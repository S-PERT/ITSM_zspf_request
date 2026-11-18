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

    function getLogonUserName() {
        if (!window.sap || !sap.ushell || !sap.ushell.Container || typeof sap.ushell.Container.getServiceAsync !== "function") {
            return Promise.resolve(null);
        }
        return sap.ushell.Container.getServiceAsync("UserInfo").then(function (oUserInfo) {
            if (!oUserInfo || typeof oUserInfo.getFullName !== "function") {
                return null;
            }
            var sFullName = oUserInfo.getFullName() || "";
            var sCleanName = sFullName.replace(/\s+/g, "");
            return sCleanName || null;
        }).catch(function (err) {
            // eslint-disable-next-line no-console
            console.warn("ListReportExt: Failed to get UserInfo:", err);
            return null;
        });
    }

    function verifyOperManager(oModel, sCleanName) {
        return new Promise(function (resolve) {
            try {
                var oListBinding = oModel.bindList("/OperManager", null, null, [
                    new Filter("Mngname", FilterOperator.EQ, sCleanName)
                ], {
                    $top: 1
                });
                oListBinding.requestContexts(0, 1).then(function (aContexts) {
                    var bExists = aContexts && aContexts.length > 0;
                    resolve(bExists);
                }).catch(function (err) {
                    // eslint-disable-next-line no-console
                    console.warn("ListReportExt: OperManager verification failed:", err);
                    resolve(false);
                });
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("ListReportExt: OperManager check exception:", e);
                resolve(false);
            }
        });
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
                }
            },
            onAfterRendering: function () {
                var that = this;
                attachGridRowNavigation(that);
                setTimeout(function () {
                    attachGridRowNavigation(that);
                }, 500);

                // onAfterStateApplied 가 호출되지 않는 버전 대비
                setTimeout(function () {
                    that._cleanup();
                    if (!that._bDefaultFilterInitialized) {
                        that._initDefaultManagerFilter();
                    }
                }, 300);
            }
        },

        _initDefaultManagerFilter: function () {
            var that = this;
            if (that._bDefaultFilterInitialized) {
                return Promise.resolve();
            }
            that._bDefaultFilterInitialized = true;

            return getLogonUserName().then(function (sCleanName) {
                if (!sCleanName) {
                    return null;
                }

                var oView = that.base.getView();
                var oFilterBar = findFilterBar(oView);
                var oExtensionAPI = that.base.getExtensionAPI();

                var pState = oFilterBar ? StateUtil.retrieveExternalState(oFilterBar) : Promise.resolve(null);
                return pState.then(function (oState) {
                    var mFilter = (oState && oState.filter) || {};
                    var aExisting = mFilter.CustomFilterProMngName;
                    if (aExisting && aExisting.length > 0) {
                        // 저장된 변형이나 URL 파라미터로 이미 필터 값이 있음 -> 기본값 덮어쓰지 않음
                        return null;
                    }

                    var oModel = oView.getModel();
                    if (!oModel || typeof oModel.bindList !== "function") {
                        // eslint-disable-next-line no-console
                        console.warn("ListReportExt: ODataModel not ready for OperManager check.");
                        return null;
                    }

                    return verifyOperManager(oModel, sCleanName).then(function (bExists) {
                        if (bExists && oExtensionAPI && typeof oExtensionAPI.setFilterValues === "function") {
                            oExtensionAPI.setFilterValues("CustomFilterProMngName", sCleanName);
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
