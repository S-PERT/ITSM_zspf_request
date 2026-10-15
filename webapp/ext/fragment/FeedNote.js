sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
    "use strict";

    var MANAGER_MAP = {
        "권순호": "3000000001",
        "김정훈": "3000000002"
    };

    function _buildUrl(sName) {
        var sMgrId = MANAGER_MAP[sName] || "";
        var sParam = "Mngname=" + encodeURIComponent(sName);
        if (sMgrId) {
            sParam += "&Manager=" + encodeURIComponent(sMgrId);
        }
        return "#ZSPF_OPERMANAGER-display?" + sParam;
    }

    function _processMentions(sText) {
        if (!sText || typeof sText !== "string") {
            return sText;
        }

        var sResult = sText;

        // 1. #홍길동 or #홍길동(변경권한추가) -> <a href="#ZSPF_OPERMANAGER-display?Mngname={Name}&Manager={Manager}">#홍길동(변경권한추가)</a>
        sResult = sResult.replace(/#([a-zA-Z0-9가-힣_-]+)(?:\(변경권한추가\))?/g, function (match, sName) {
            var sUrl = _buildUrl(sName);
            return '<a href="' + sUrl + '">#' + sName + '(변경권한추가)</a>';
        });

        // 2. @홍길동 -> <a href="#ZSPF_OPERMANAGER-display?Mngname={Name}&Manager={Manager}">@홍길동</a>
        sResult = sResult.replace(/@([a-zA-Z0-9가-힣_-]+)/g, function (match, sName) {
            var sUrl = _buildUrl(sName);
            return '<a href="' + sUrl + '">@' + sName + '</a>';
        });

        return sResult;
    }

    var FeedNoteHandler = {
        onPostFeed: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            if (!sValue || !sValue.trim()) {
                return;
            }

            var oFeedInput = oEvent.getSource();
            var oUIModel = oFeedInput.getModel("ui");
            if (oUIModel && !oUIModel.getProperty("/isEditable")) {
                MessageToast.show("수정 모드에서만 댓글을 작성할 수 있습니다.");
                return;
            }

            var oContainer = oFeedInput.getParent();
            var oList = oContainer.getItems().find(function (oItem) {
                return oItem.isA && oItem.isA("sap.m.List");
            });

            if (!oList) {
                return;
            }

            var oBinding = oList.getBinding("items");
            if (!oBinding) {
                MessageToast.show("데이터 바인딩을 찾을 수 없습니다.");
                return;
            }

            var sProcessedContent = _processMentions(sValue.trim());

            var oContext = oBinding.create({
                Content: sProcessedContent
            });

            if (oContext && oContext.created) {
                oContext.created().then(function () {
                    MessageToast.show("댓글이 등록되었습니다. (저장 시 최종 반영됩니다)");
                }).catch(function (oError) {
                    if (!oError.canceled) {
                        MessageToast.show("댓글 등록 중 오류가 발생했습니다.");
                        try {
                            oContext.delete();
                        } catch (e) {
                            // ignore
                        }
                    }
                });
            }
        },

        onDeleteFeed: function (oEvent) {
            var oAction = oEvent.getSource();
            var oContext = oAction.getBindingContext();
            if (!oContext && oAction.getParent) {
                var oParent = oAction.getParent();
                if (oParent && oParent.getBindingContext) {
                    oContext = oParent.getBindingContext();
                }
            }

            if (!oContext) {
                MessageToast.show("삭제 대상을 찾을 수 없습니다.");
                return;
            }

            MessageBox.confirm("댓글을 삭제하시겠습니까?", {
                title: "댓글 삭제",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oContext.delete().then(function () {
                            MessageToast.show("댓글이 삭제되었습니다.");
                        }).catch(function (oError) {
                            if (!oError.canceled) {
                                MessageToast.show("댓글 삭제 중 오류가 발생했습니다: " + (oError.message || ""));
                            }
                        });
                    }
                }
            });
        }
    };

    return FeedNoteHandler;
});
