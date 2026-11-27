sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "zsp/itsm/zspfrequest/ext/fragment/FeedNote",
    "sap/m/Button",
    "sap/m/Popover",
    "sap/m/FormattedText",
    "sap/ui/layout/form/ColumnElementData"
], function (ControllerExtension, FeedNote, Button, Popover, FormattedText, ColumnElementData) {
    "use strict";

    // 필드 옆 도움말(popover) 대상: 필드명 → i18n 키 접두어 (<접두어>HelpTitle / <접두어>HelpText)
    var mFieldHelp = {
        Zlevel: "zlevel",
        ManHours: "manHours"
    };
    var sFormElementMarker = "::FormElement::DataField::";

    /**
     * Adds a hint button next to each field listed in mFieldHelp.
     * The fields come from UI.Identification (form GeneralInfo); FE gives each form element the
     * stable id "...::FormElement::DataField::<Property>". Already attached fields are skipped.
     * @param {object} oController The controller extension
     */
    function attachFieldHelp(oController) {
        var oView = oController.base.getView();
        var aFormElements = oView.findAggregatedObjects(true, function (oControl) {
            if (!oControl.isA("sap.ui.layout.form.FormElement") || oControl._bZspHelpAttached) {
                return false;
            }
            var sId = oControl.getId();
            var iPos = sId.lastIndexOf(sFormElementMarker);
            return iPos !== -1 && mFieldHelp.hasOwnProperty(sId.slice(iPos + sFormElementMarker.length));
        });

        aFormElements.forEach(function (oFormElement) {
            var sId = oFormElement.getId();
            var sKey = mFieldHelp[sId.slice(sId.lastIndexOf(sFormElementMarker) + sFormElementMarker.length)];
            oFormElement._bZspHelpAttached = true;
            oFormElement.addField(new Button({
                icon: "sap-icon://hint",
                type: "Transparent",
                tooltip: "{i18n>fieldHelpTooltip}",
                layoutData: new ColumnElementData({ cellsSmall: 2, cellsLarge: 1 }),
                press: function (oEvent) {
                    oController._openFieldHelp(oEvent.getSource(), sKey);
                }
            }));
        });
    }

    function refreshAttachmentTable(oView) {
        if (!oView) {
            return;
        }
        try {
            var oTable = oView.byId("fe::table::_Attachment::LineItem");
            if (!oTable) {
                var aTables = oView.findAggregatedObjects(true, function (oControl) {
                    return oControl && oControl.getId && oControl.getId().indexOf("_Attachment") !== -1 &&
                        (oControl.isA("sap.ui.mdc.Table") || oControl.isA("sap.m.Table"));
                });
                if (aTables && aTables.length > 0) {
                    oTable = aTables[0];
                }
            }

            if (oTable) {
                if (typeof oTable.getRowBinding === "function" && oTable.getRowBinding()) {
                    oTable.getRowBinding().refresh();
                    return;
                }
                if (typeof oTable.getBinding === "function" && oTable.getBinding("items")) {
                    oTable.getBinding("items").refresh();
                    return;
                }
            }

            var oContext = oView.getBindingContext();
            if (oContext && typeof oContext.refresh === "function") {
                oContext.refresh();
            }
        } catch (e) {
            // ignore
        }
    }

    function refreshProManagerTable(oView) {
        var oContext = oView && oView.getBindingContext();
        if (!oContext || typeof oContext.requestSideEffects !== "function") {
            return;
        }
        // 저장 시 반영 안내 토스트는 백엔드(proMngDelete 성공 메시지)에서 처리
        oContext.requestSideEffects([{ $NavigationPropertyPath: "_Promanager" }]).catch(function () {
            // ignore
        });
    }

    return ControllerExtension.extend("zsp.itsm.zspfrequest.ext.controller.ObjectPageExt", {
        override: {
            onInit: function () {
                var oView = this.base.getView();

                if (!window._itsmAttachmentXhrHooked) {
                    window._itsmAttachmentXhrHooked = true;
                    var origOpen = XMLHttpRequest.prototype.open;
                    var origSend = XMLHttpRequest.prototype.send;

                    XMLHttpRequest.prototype.open = function (method, url) {
                        this._itsmMethod = method;
                        this._itsmUrl = url;
                        return origOpen.apply(this, arguments);
                    };

                    XMLHttpRequest.prototype.send = function () {
                        var self = this;
                        var sUrl = self._itsmUrl ? self._itsmUrl.toString() : "";
                        var sMethod = self._itsmMethod ? self._itsmMethod.toString().toUpperCase() : "";

                        // proMngDelete(진행담당자 논리삭제) 실행 후 진행담당자 테이블 재조회
                        // - 행 컨텍스트에 바인딩된 액션이라 _it/_Request/_Promanager SideEffects가 부모 테이블에 전달되지 않음
                        // - 재조회 시 SelectionPresentationVariant#Active 필터(Delflag eq '')가 적용되어 draft에서도 행이 사라짐
                        var vBody = arguments[0];
                        if (sMethod === "POST" && typeof vBody === "string" && vBody.indexOf("proMngDelete") !== -1) {
                            self.addEventListener("load", function () {
                                if (self.status >= 200 && self.status < 300) {
                                    refreshProManagerTable(oView);
                                }
                            });
                        }

                        if (sUrl.indexOf("/Attachment") !== -1 || sUrl.indexOf("_Attachment") !== -1) {
                            if (sMethod === "PUT" || sMethod === "PATCH" || sMethod === "POST") {
                                self.addEventListener("load", function () {
                                    if (self.status >= 200 && self.status < 300) {
                                        setTimeout(function () {
                                            refreshAttachmentTable(oView);
                                        }, 400);
                                    }
                                });
                            }
                        }
                        return origSend.apply(this, arguments);
                    };
                }

                sap.ui.require(["sap/ui/unified/FileUploader"], function (FileUploader) {
                    if (FileUploader && !FileUploader._itsmPatched) {
                        FileUploader._itsmPatched = true;
                        var origFireUploadComplete = FileUploader.prototype.fireUploadComplete;
                        FileUploader.prototype.fireUploadComplete = function () {
                            var res = origFireUploadComplete.apply(this, arguments);
                            var sId = (this.getId && this.getId()) || "";
                            if (sId.indexOf("Attachment") !== -1 || sId.indexOf("attachment") !== -1) {
                                setTimeout(function () {
                                    refreshAttachmentTable(oView);
                                }, 400);
                            }
                            return res;
                        };
                    }
                });

                if (oView) {
                    oView.addEventDelegate({
                        onAfterRendering: function () {
                            var $fi = oView.$().find(".sapMFeedInput");
                            var $ta = $fi.find("textarea");
                            if ($ta.length) {
                                $ta.attr("placeholder", "여기에 기록하십시오(댓글언급:@홍길동 ,수정권한부여 #홍길동)");
                            }
                        }
                    });
                }
            },

            routing: {
                onAfterBinding: function () {
                    attachFieldHelp(this);
                }
            }
        },

        /**
         * Opens the help popover of a field next to its hint button (press again to close).
         * @param {sap.m.Button} oButton The hint button
         * @param {string} sKey The i18n key prefix of the field
         */
        _openFieldHelp: function (oButton, sKey) {
            if (!this._oFieldHelpPopover) {
                this._oFieldHelpText = new FormattedText().addStyleClass("sapUiSmallMargin");
                this._oFieldHelpPopover = new Popover({
                    placement: "Bottom",
                    contentWidth: "20rem",
                    content: [this._oFieldHelpText]
                });
                // dependent of the view: gets the i18n model and is destroyed with the view
                this.base.getView().addDependent(this._oFieldHelpPopover);
            }
            var oPopover = this._oFieldHelpPopover;
            if (oPopover.isOpen()) {
                oPopover.close();
                if (this._oFieldHelpButton === oButton) {
                    return;
                }
            }
            this._oFieldHelpButton = oButton;
            oPopover.bindProperty("title", "i18n>" + sKey + "HelpTitle");
            this._oFieldHelpText.bindProperty("htmlText", "i18n>" + sKey + "HelpText");
            oPopover.openBy(oButton);
        },

        onPostFeed: function (oEvent) {
            FeedNote.onPostFeed(oEvent);
        },

        onDeleteFeed: function (oEvent) {
            FeedNote.onDeleteFeed(oEvent);
        }
    });
});
