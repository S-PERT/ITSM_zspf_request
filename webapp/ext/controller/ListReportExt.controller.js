sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/mdc/p13n/StateUtil"
], function (ControllerExtension, StateUtil) {
    "use strict";

    // 외부 앱(Cross-App Navigation)에서 진입 시 유지할 필터 (화이트리스트)
    var aAllowedFilters = ["Custno"];

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

    return ControllerExtension.extend("zsp.itsm.zspfrequest.ext.controller.ListReportExt", {
        override: {
            onInit: function () {
                this._bCleaned = false;
            },
            viewState: {
                onAfterStateApplied: function () {
                    this._cleanup();
                }
            },
            onAfterRendering: function () {
                var that = this;
                attachGridRowNavigation(that);
                setTimeout(function () {
                    attachGridRowNavigation(that);
                }, 500);

                // onAfterStateApplied 가 호출되지 않는 버전 대비
                setTimeout(function () { that._cleanup(); }, 300);
            }
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
});
