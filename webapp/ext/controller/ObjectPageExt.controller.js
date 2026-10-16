sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "zsp/itsm/zspfrequest/ext/fragment/FeedNote"
], function (ControllerExtension, FeedNote) {
    "use strict";

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
            }
        },

        onPostFeed: function (oEvent) {
            FeedNote.onPostFeed(oEvent);
        },

        onDeleteFeed: function (oEvent) {
            FeedNote.onDeleteFeed(oEvent);
        }
    });
});
