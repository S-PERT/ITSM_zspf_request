/* global Promise */
sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/mdc/p13n/StateUtil",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/util/Storage",
    "zsp/itsm/zspfrequest/ext/controller/ListReportExt",
    "sap/m/Button",
    "sap/m/Popover",
    "sap/m/FormattedText"
], function (ControllerExtension, StateUtil, Filter, FilterOperator, Storage, FilterHandler, Button, Popover, FormattedText) {
    "use strict";

    var sOperatorName = FilterHandler.OPERATOR_NAME;
    var sDefaultUnassignedText = "미지정";
    var findFilterBar = FilterHandler.findFilterBar;

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

    function getLogonUserId() {
        if (!window.sap || !sap.ushell || !sap.ushell.Container || typeof sap.ushell.Container.getServiceAsync !== "function") {
            return Promise.resolve(null);
        }
        return sap.ushell.Container.getServiceAsync("UserInfo").then(function (oUserInfo) {
            if (!oUserInfo) {
                return null;
            }
            var sUserId = (typeof oUserInfo.getId === "function" && oUserInfo.getId()) || "";
            if (!sUserId && typeof oUserInfo.getUser === "function" && oUserInfo.getUser()) {
                var oUser = oUserInfo.getUser();
                sUserId = (typeof oUser.getId === "function" && oUser.getId()) || "";
            }
            sUserId = String(sUserId || "").trim();
            return sUserId || null;
        }).catch(function (err) {
            // eslint-disable-next-line no-console
            console.warn("ListReportExt: Failed to get UserInfo:", err);
            return null;
        });
    }

    function findManagerNameByUserId(oModel, sUserId) {
        if (!sUserId) {
            return Promise.resolve(null);
        }
        return new Promise(function (resolve) {
            try {
                var sUpperId = sUserId.toUpperCase();
                var aFilters = [new Filter("Uname", FilterOperator.EQ, sUpperId)];
                if (sUserId !== sUpperId) {
                    aFilters.push(new Filter("Uname", FilterOperator.EQ, sUserId));
                }
                var oFilter = aFilters.length > 1 ? new Filter({ filters: aFilters, and: false }) : aFilters[0];

                var oListBinding = oModel.bindList("/OperManager", undefined, undefined, [oFilter], {
                    $select: ["Manager", "Mngname", "Uname"]
                });
                oListBinding.requestContexts(0, 1).then(function (aContexts) {
                    if (aContexts && aContexts.length > 0) {
                        var oContext = aContexts[0];
                        var oData = (typeof oContext.getObject === "function" && oContext.getObject()) ||
                                    (typeof oContext.getProperty === "function" && { Mngname: oContext.getProperty("Mngname") });
                        var sMngname = oData && oData.Mngname ? String(oData.Mngname).trim() : "";
                        resolve(sMngname || sDefaultUnassignedText);
                    } else {
                        // 시스템 ID(Uname)와 일치하는 운영 담당자가 없으면 "미지정" 세팅
                        resolve(sDefaultUnassignedText);
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

    function setCustomFilterInputValue(oView, sValue, bForce) {
        if (!oView) {
            return;
        }
        var aInputs = oView.findAggregatedObjects(true, function (c) {
            return c && c.isA && (c.isA("sap.m.MultiInput") || c.isA("sap.m.Input")) &&
                   c.getId && c.getId().indexOf("CustomFilterProMngNameInput") !== -1;
        });
        if (aInputs && aInputs.length > 0) {
            aInputs.forEach(function (oInput) {
                if (oInput.isA("sap.m.MultiInput")) {
                    FilterHandler.ensureMultiInputInitialized(oInput);
                    if (!bForce && (oInput._bUserModified || oInput._bInitialDefaultSynced)) {
                        return;
                    }
                    if (sValue !== undefined && sValue !== null) {
                        oInput._bInitialDefaultSynced = true;
                        FilterHandler.syncTokensFromValue(oInput, sValue);
                        FilterHandler.applyFilterValueFromMultiInput(oInput, sValue);
                    }
                } else if (sValue && oInput.getValue() !== sValue) {
                    oInput.setValue(sValue);
                }
            });
        }
    }

    // Upper bound for holding the filter bar suspended; past it the hold is released and a search runs
    var iMaxHoldMs = 8000;

    // Last selected quick filter tab (진행/완료/전체), kept per browser session.
    // FE restores it from the iAppState only when that state is not empty; on reload it often is.
    var sQuickFilterStorageKey = "quickFilterKey";
    var oSessionStorage = new Storage(Storage.Type.session, "zsp.itsm.zspfrequest");

    function readStoredQuickFilterKey() {
        try {
            return oSessionStorage.get(sQuickFilterStorageKey);
        } catch (e) {
            return null;
        }
    }

    function storeQuickFilterKey(sKey) {
        try {
            if (sKey) {
                oSessionStorage.put(sQuickFilterStorageKey, sKey);
            }
        } catch (e) {
            // storage unavailable (private mode, blocked): the tab simply is not remembered
        }
    }

    // Filter bar conditions of the last search, kept per browser session, so a reload keeps
    // what the user set (including a cleared manager filter) instead of re-applying the default.
    var sFilterStateStorageKey = "filterState";

    function readStoredFilterState() {
        try {
            var sJson = oSessionStorage.get(sFilterStateStorageKey);
            return sJson ? JSON.parse(sJson) : null;
        } catch (e) {
            return null;
        }
    }

    function storeFilterState(oFilterBar) {
        return StateUtil.retrieveExternalState(oFilterBar).then(function (oState) {
            var mFilter = (oState && oState.filter) || {};
            var mStored = {};
            Object.keys(mFilter).forEach(function (sKey) {
                // "$" keys ($editState, $search) belong to FE and are set by it on every load
                if (sKey.charAt(0) !== "$" && mFilter[sKey] && mFilter[sKey].length) {
                    mStored[sKey] = mFilter[sKey];
                }
            });
            try {
                oSessionStorage.put(sFilterStateStorageKey, JSON.stringify(mStored));
            } catch (e) {
                // storage unavailable: the filter simply is not remembered
            }
        }).catch(function () {
            // state not retrievable: keep the previous snapshot
        });
    }

    function getStoredManagerName(mStored) {
        var aConds = mStored && mStored.CustomFilterProMngName;
        var vValues = aConds && aConds[0] && aConds[0].values;
        var vVal = Array.isArray(vValues) && vValues.length ? vValues[0] : vValues;
        return vVal ? String(vVal) : "";
    }

    function findQuickFilter(oView) {
        var aTables = oView ? oView.findAggregatedObjects(true, function (o) {
            return o && o.isA && o.isA("sap.ui.mdc.Table");
        }) : [];
        for (var i = 0; i < aTables.length; i++) {
            var oQuickFilter = typeof aTables[i].getQuickFilter === "function" && aTables[i].getQuickFilter();
            if (oQuickFilter) {
                return oQuickFilter;
            }
        }
        return null;
    }

    function attachQuickFilterPersistence(oView) {
        var oQuickFilter = findQuickFilter(oView);
        if (!oQuickFilter || oQuickFilter._bZspPersistAttached) {
            return;
        }
        oQuickFilter._bZspPersistAttached = true;
        // SegmentedButton fires selectionChange, Select (more than three tabs) fires change
        var sEvent = oQuickFilter.getMetadata().hasEvent("selectionChange") ? "selectionChange" : "change";
        oQuickFilter.attachEvent(sEvent, function () {
            storeQuickFilterKey(oQuickFilter.getSelectedKey());
        });
    }

    /**
     * Places a help button right after the quick filter tabs (진행/완료/전체).
     * The mdc Table puts the quick filter into its toolbar's "between" aggregation; the button
     * goes into the same aggregation. Called again after rendering, since the table re-adds the
     * quick filter at the end of "between" when it is set again.
     * @param {object} oController The controller extension
     */
    function attachQuickFilterHelp(oController) {
        var oView = oController.base.getView();
        var oQuickFilter = findQuickFilter(oView);
        var oToolbar = oQuickFilter && oQuickFilter.getParent();
        if (!oToolbar || oQuickFilter.sParentAggregationName !== "between") {
            return;
        }
        var oButton = oController._oTabHelpButton;
        if (!oButton) {
            oButton = new Button({
                icon: "sap-icon://hint",
                type: "Transparent",
                tooltip: "{i18n>tabHelpTooltip}",
                press: function (oEvent) {
                    oController._openTabHelp(oEvent.getSource());
                }
            });
            oController._oTabHelpButton = oButton;
        }
        var iFilterIdx = oToolbar.indexOfBetween(oQuickFilter);
        if (oButton.getParent() === oToolbar && oToolbar.indexOfBetween(oButton) === iFilterIdx + 1) {
            return;
        }
        if (oButton.getParent() === oToolbar) {
            oToolbar.removeBetween(oButton);
            iFilterIdx = oToolbar.indexOfBetween(oQuickFilter);
        }
        oToolbar.insertBetween(oButton, iFilterIdx + 1);
    }

    /**
     * Selects the remembered tab without rebinding; the caller's next search picks it up.
     * @param {sap.ui.core.mvc.View} oView The list report view
     * @returns {boolean} Whether the selection changed
     */
    function restoreQuickFilterKey(oView) {
        var sKey = readStoredQuickFilterKey();
        var oQuickFilter = findQuickFilter(oView);
        if (!sKey || !oQuickFilter || oQuickFilter.getSelectedKey() === sKey) {
            return false;
        }
        var bExists = (oQuickFilter.getItems() || []).some(function (oItem) {
            return oItem.getKey() === sKey;
        });
        if (!bExists) {
            return false;
        }
        oQuickFilter.setSelectedKey(sKey);
        return true;
    }

    function holdFilterBarSuspend(oFilterBar) {
        if (!oFilterBar) {
            return;
        }
        if (!oFilterBar._bSuspendWrapped) {
            oFilterBar._bSuspendWrapped = true;
            var fnOrigSetSuspend = oFilterBar.setSuspendSelection;
            oFilterBar.setSuspendSelection = function (bSuspend) {
                if (!bSuspend && this._bHoldUnsuspend) {
                    this._bPendingUnsuspend = true;
                    return this;
                }
                return fnOrigSetSuspend.apply(this, arguments);
            };
        }
        oFilterBar._bHoldUnsuspend = true;
        oFilterBar.setSuspendSelection(true);

        // Safety net: a hold that is never released leaves the list without any request,
        // and "Go" does nothing while the filter bar stays suspended
        if (oFilterBar._iHoldTimer) {
            clearTimeout(oFilterBar._iHoldTimer);
        }
        oFilterBar._iHoldTimer = setTimeout(function () {
            oFilterBar._iHoldTimer = null;
            if (oFilterBar._bHoldUnsuspend) {
                // eslint-disable-next-line no-console
                console.warn("ListReportExt: filter bar hold not released in time, releasing and searching.");
                releaseFilterBarSuspendAndSearch(oFilterBar, null, true);
            }
        }, iMaxHoldMs);
    }

    function releaseFilterBarSuspendAndSearch(oFilterBar, oExtensionAPI, bTriggerSearch) {
        if (!oFilterBar) {
            return Promise.resolve();
        }
        if (oFilterBar._iHoldTimer) {
            clearTimeout(oFilterBar._iHoldTimer);
            oFilterBar._iHoldTimer = null;
        }
        if (bTriggerSearch) {
            // While suspended, triggerSearch sets oFilterBar._bSearchTriggered = true
            if (typeof oFilterBar.triggerSearch === "function") {
                oFilterBar.triggerSearch();
            }
        }
        oFilterBar._bHoldUnsuspend = false;
        if (oFilterBar._bPendingUnsuspend || oFilterBar.getSuspendSelection()) {
            oFilterBar._bPendingUnsuspend = false;
            oFilterBar.setSuspendSelection(false);
        }
        if (bTriggerSearch) {
            var oFilterBarAPI = oFilterBar.getParent && oFilterBar.getParent();
            if (oFilterBarAPI && typeof oFilterBarAPI.triggerSearch === "function") {
                return oFilterBarAPI.triggerSearch();
            }
            if (oExtensionAPI && typeof oExtensionAPI.refresh === "function") {
                return oExtensionAPI.refresh();
            }
            if (typeof oFilterBar.triggerSearch === "function") {
                return oFilterBar.triggerSearch();
            }
        }
        return Promise.resolve();
    }

    var ListReportExt = ControllerExtension.extend("zsp.itsm.zspfrequest.ext.controller.ListReportExt", {
        override: {
            onInit: function () {
                this._bCleaned = false;
                this._bDefaultFilterApplied = false;
                this._pMatchedManagerName = null;
                this._sDefaultManagerName = null;
                this._bStateHooksCalled = false;
                this._bFilterStateReady = false;
                var oFilterBar = findFilterBar(this.base.getView());
                // No hold here: FE skips both onBeforeStateApplied and onAfterStateApplied when an
                // iAppState carries no state for this view (ViewState.applyViewState), so a hold taken
                // in onInit was never released and swallowed FE's own initial search.
                // The hold is taken in onBeforeStateApplied, which FE always pairs with onAfterStateApplied.
                this._attachDefaultFilterFallback(oFilterBar);
            },
            viewState: {
                onBeforeStateApplied: function (aPromises) {
                    this._bStateHooksCalled = true;
                    var oFilterBar = findFilterBar(this.base.getView());
                    if (oFilterBar && !this._bDefaultFilterApplied) {
                        holdFilterBarSuspend(oFilterBar);
                    }
                    if (!this._pMatchedManagerName) {
                        this._pMatchedManagerName = this._resolveDefaultManagerName();
                        if (aPromises && Array.isArray(aPromises)) {
                            aPromises.push(this._pMatchedManagerName);
                        }
                    }
                },
                onAfterStateApplied: function (aPromises) {
                    var that = this;
                    var oView = that.base.getView();
                    var oFilterBar = findFilterBar(oView);
                    var oExtensionAPI = that.base.getExtensionAPI();

                    if (!that._bDefaultFilterApplied) {
                        // Not pushed into aPromises: the default filter reads and writes the filter bar
                        // state (StateUtil / setFilterValues), which waits for the state application
                        // that would itself wait for aPromises. With an app state to restore (e.g. after
                        // switching the quick variant tab and reloading) the two never finished.
                        // The filter bar stays suspended until the release below, so no early search.
                        that._applyDefaultFilterBeforeSearch().then(function (bApplied) {
                            that._bFilterStateReady = true;
                            return releaseFilterBarSuspendAndSearch(oFilterBar, oExtensionAPI, true);
                        }).catch(function (oErr) {
                            that._bFilterStateReady = true;
                            return releaseFilterBarSuspendAndSearch(oFilterBar, oExtensionAPI, true);
                        });
                    } else {
                        that._bFilterStateReady = true;
                        that._cleanup();
                        releaseFilterBarSuspendAndSearch(oFilterBar, oExtensionAPI, false);
                    }
                }
            },
            onAfterRendering: function () {
                var that = this;
                var oView = that.base.getView();
                attachGridRowNavigation(that);
                attachQuickFilterPersistence(oView);
                attachQuickFilterHelp(that);
                setTimeout(function () {
                    attachGridRowNavigation(that);
                    attachQuickFilterPersistence(oView);
                    attachQuickFilterHelp(that);
                }, 500);

                if (that._sDefaultManagerName) {
                    setCustomFilterInputValue(oView, that._sDefaultManagerName, false);
                }
            }
        },

        /**
         * Opens the popover that explains the 진행/완료/전체 tabs.
         * @param {sap.m.Button} oButton The help button the popover opens from
         */
        _openTabHelp: function (oButton) {
            if (!this._oTabHelpPopover) {
                this._oTabHelpPopover = new Popover({
                    title: "{i18n>tabHelpTitle}",
                    placement: "Bottom",
                    contentWidth: "20rem",
                    content: [
                        new FormattedText({ htmlText: "{i18n>tabHelpText}" }).addStyleClass("sapUiSmallMargin")
                    ]
                });
                // dependent of the view: gets the i18n model and is destroyed with the view
                this.base.getView().addDependent(this._oTabHelpPopover);
            }
            if (this._oTabHelpPopover.isOpen()) {
                this._oTabHelpPopover.close();
            } else {
                this._oTabHelpPopover.openBy(oButton);
            }
        },

        /**
         * Applies the default manager filter when FE skipped the viewState hooks
         * (iAppState without state for this view, e.g. reload or back navigation).
         * Runs once, after FE's own first search, and searches again with the filter.
         * @param {sap.ui.mdc.FilterBar} oFilterBar The filter bar
         */
        _attachDefaultFilterFallback: function (oFilterBar) {
            var that = this;
            if (!oFilterBar || typeof oFilterBar.attachEventOnce !== "function") {
                return;
            }
            // Remember the filter state on every search or filter change once the initial filter is settled
            var fnStore = function () {
                if (that._bFilterStateReady) {
                    storeFilterState(oFilterBar);
                }
            };
            oFilterBar.attachSearch(fnStore);
            if (typeof oFilterBar.attachFiltersChanged === "function") {
                oFilterBar.attachFiltersChanged(fnStore);
            }
            oFilterBar.attachEventOnce("search", function () {
                if (that._bStateHooksCalled || that._bDefaultFilterApplied) {
                    return;
                }
                var oView = that.base.getView();
                var bTabRestored = restoreQuickFilterKey(oView);
                var mStored = readStoredFilterState();

                var pFilter;
                if (mStored) {
                    // Restore what the user had; an absent manager condition means it was cleared
                    that._bDefaultFilterApplied = true;
                    var bHasConditions = Object.keys(mStored).length > 0;
                    pFilter = (bHasConditions ? StateUtil.applyExternalState(oFilterBar, { filter: mStored }) : Promise.resolve())
                        .then(function () {
                            var sManager = getStoredManagerName(mStored);
                            if (sManager) {
                                setCustomFilterInputValue(oView, sManager, true);
                            }
                            return bHasConditions;
                        });
                } else {
                    pFilter = that._applyDefaultFilterBeforeSearch();
                }

                pFilter.then(function (bChanged) {
                    that._bFilterStateReady = true;
                    if (bChanged || bTabRestored) {
                        var oFilterBarAPI = oFilterBar.getParent && oFilterBar.getParent();
                        if (oFilterBarAPI && typeof oFilterBarAPI.triggerSearch === "function") {
                            return oFilterBarAPI.triggerSearch();
                        }
                        return oFilterBar.triggerSearch();
                    }
                    storeFilterState(oFilterBar);
                    return null;
                }).catch(function (oErr) {
                    that._bFilterStateReady = true;
                });
            });
        },

        _resolveDefaultManagerName: function () {
            var that = this;
            return getLogonUserId().then(function (sUserId) {
                if (!sUserId) {
                    return null;
                }
                var oView = that.base.getView();
                var oModel = oView.getModel() || (that.base.getAppComponent && that.base.getAppComponent().getModel());
                if (!oModel || typeof oModel.bindList !== "function") {
                    // eslint-disable-next-line no-console
                    console.warn("ListReportExt: ODataModel not ready for OperManager check.");
                    return null;
                }
                return findManagerNameByUserId(oModel, sUserId);
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
                var sDefaultFilterValue = aResults[1];
                if (!sDefaultFilterValue || !oFilterBar) {
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

                    that._sDefaultManagerName = sDefaultFilterValue;

                    var pSetFilter;
                    if (oExtensionAPI && typeof oExtensionAPI.setFilterValues === "function") {
                        pSetFilter = oExtensionAPI.setFilterValues("CustomFilterProMngName", sOperatorName, sDefaultFilterValue);
                    } else {
                        pSetFilter = StateUtil.applyExternalState(oFilterBar, {
                            filter: {
                                CustomFilterProMngName: [
                                    { operator: sOperatorName, values: [sDefaultFilterValue] }
                                ]
                            }
                        });
                    }

                    return Promise.resolve(pSetFilter).then(function () {
                        setCustomFilterInputValue(oView, sDefaultFilterValue, true);
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
    ListReportExt.onTokenUpdate = FilterHandler.onTokenUpdate;
    ListReportExt.onInputChange = FilterHandler.onInputChange;

    return ListReportExt;
});
