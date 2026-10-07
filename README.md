## Application Details
|               |
| ------------- |
|**Generation Date and Time**<br>Wed Sep 23 2026 12:34:22 GMT+0900 (Korean Standard Time)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.32.0|
|**Generation Platform**<br>Visual Studio Code|
|**Template Used**<br>List Report Page V4|
|**Service Type**<br>OData URL|
|**Service URL**<br>https://saphana2.s-pert.com:44360/sap/opu/odata4/sap/zsp_itsm_p_request_ui_v4/srvd/sap/zsp_itsm_p_request_ui/0001/|
|**Module Name**<br>zspf_request|
|**Application Title**<br>고객업체 요청관리|
|**Namespace**<br>zsp.itsm|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.152.0|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>True, see https://www.npmjs.com/package/@sap-ux/eslint-plugin-fiori-tools#rules for the eslint rules.|
|**Main Entity**<br>Main|
|**Navigation Entity**<br>None|

## zspf_request

고객업체 요청관리

### Starting the generated app

-   This app has been generated using the SAP Fiori tools - App Generator, as part of the SAP Fiori tools suite.  To launch the generated application, run the following from the generated application root folder:

```
    npm start
```

- It is also possible to run the application using mock data that reflects the OData Service URL supplied during application generation.  In order to run the application with Mock Data, run the following from the generated app root folder:

```
    npm run start-mock
```

#### Pre-requisites:

1. Active NodeJS LTS (Long Term Support) version and associated supported NPM version.  (See https://nodejs.org)


### Custom Extensions (Rich Text Editor & Selection Fields)

Fiori Elements 표준 List Report V4 템플릿에 커스텀 에디터(Tiptap) 적용 및 Selection Filter 추가 구성을 적용한 내역입니다.

<br>

#### 1) manifest.json — 커스텀 섹션을 ObjectPage에 등록

`sap.ui5 > routing > targets > MainObjectPage > options > settings > content > body > sections` 아래에 커스텀 섹션 2개(요청내역, 처리내역)를 선언합니다. ObjectPage 컨트롤러 확장을 통해 로드됩니다.

```json
"MainObjectPage": {
  "options": {
    "settings": {
      "editableHeaderContent": false,
      "contextPath": "/Main",
      "controllerExtensions": {
        "sap.fe.templates.ObjectPage.ObjectPageController": {
          "controllerName": "zsp.itsm.zspfrequest.ext.controller.ObjectPageExt"
        }
      },
      "content": {
        "body": {
          "sections": {
            "ReqComent": {
              "template": "zsp.itsm.zspfrequest.ext.fragment.ReqComent",
              "position": {
                "placement": "After",
                "anchor": "ItemAttachment"
              },
              "title": "요청내역"
            },
            "ProComent": {
              "template": "zsp.itsm.zspfrequest.ext.fragment.ProComent",
              "position": {
                "placement": "After",
                "anchor": "ReqComent"
              },
              "title": "처리내역"
            }
          }
        }
      }
    }
  }
}
```

#### 2) ReqComent.fragment.xml / ProComent.fragment.xml — UI 컴포넌트 구성
표준 화면에 삽입될 커스텀 에디터 영역입니다. TinyMCE 대신 `TiptapEditor` 커스텀 UI5 컨트롤을 사용하여 OData V4 모델과 양방향(TwoWay) 데이터 바인딩을 수행합니다.

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:editor="zsp.itsm.zspfrequest.ext.controller"> 
    
    <VBox class="sapUiContentPadding">
        <editor:TiptapEditor
            id="myTE"
            value="{path: 'ReqComent', mode: 'TwoWay'}" 
            editable="{ui>/isEditable}" />
    </VBox>
</core:FragmentDefinition>
```

#### 3) TiptapEditor.js — 에디터 커스텀 컨트롤 정의
`sap/ui/core/Control`을 확장하여 Tiptap 런타임을 감싸는 커스텀 UI5 컨트롤 래퍼를 생성합니다. `onAfterRendering`에서 Tiptap 인스턴스를 마운트하고, 변경 시 `setProperty`를 통해 OData 모델에 동기화합니다.

```javascript
sap.ui.define([
    "sap/ui/core/Control",
    "zsp/itsm/zspfrequest/ext/controller/tiptap"
], function (Control, Runtime) {
    "use strict";
    return Control.extend("zsp.itsm.zspfrequest.ext.controller.TiptapEditor", {
        // ... (properties: value, editable)
        onAfterRendering: function () {
            this._runtime = Runtime.mount(this.getDomRef("host"), {
                value: this.getValue(),
                editable: this.getEditable(),
                onChange: function (html) {
                    this.setProperty("value", html, true);
                }.bind(this)
            });
        }
        // ...
    });
});
```

#### 4) annotation.xml — 진행담당자(Manager) 내비게이션 필터 추가
OData V4 환경에서 Header 엔티티 리스트를 조회할 때, 1:N 관계인 자식 엔티티(진행담당자)의 필드로 필터링하기 위해 `@UI.SelectionFields` 어노테이션에 `_Promanager/Manager` 경로를 직접 명시했습니다. 이 방식은 백엔드에서 `EXISTS` 서브쿼리로 자동 변환되어 헤더 데이터의 중복 조회를 방지합니다.

```xml
<Annotations Target="SAP__self.MainType">
    <Annotation Term="UI.SelectionFields">
        <Collection>
            <PropertyPath>RequestNo</PropertyPath>
            <PropertyPath>Custno</PropertyPath>
            <PropertyPath>ReqType</PropertyPath>
            <PropertyPath>Zstat</PropertyPath>
            <PropertyPath>ReqDate</PropertyPath>
            <PropertyPath>_Promanager/Manager</PropertyPath>
        </Collection>
    </Annotation>
</Annotations>
```
