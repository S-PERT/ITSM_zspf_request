sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "zsp/itsm/zspfrequest/ext/fragment/FeedNote"
], function (ControllerExtension, FeedNote) {
    "use strict";

    return ControllerExtension.extend("zsp.itsm.zspfrequest.ext.controller.ObjectPageExt", {
        override: {
            onInit: function () {
                var oView = this.base.getView();
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
