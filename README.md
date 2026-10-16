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


### Custom Extensions & Enhancements

Fiori Elements 표준 List Report / Object Page V4 템플릿에 적용된 커스텀 확장(Rich Text Editor, 댓글 피드, Side Effects, Cross-App Navigation 필터링 제어 등) 내역입니다.

<br>

#### 1) manifest.json — 커스텀 섹션 등록 (에디터 & 댓글)

`sap.ui5 > routing > targets > MainObjectPage > options > settings > content > body > sections` 아래에 커스텀 섹션 3개(요청내역, 처리내역, 댓글)를 선언하여 ObjectPage에 마운트합니다.

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
            },
            "ReqFeed": {
              "template": "zsp.itsm.zspfrequest.ext.fragment.FeedNote",
              "position": {
                "placement": "After",
                "anchor": "ProComent"
              },
              "title": "댓글"
            }
          }
        }
      }
    }
  }
}
```

#### 2) ReqComent.fragment.xml / ProComent.fragment.xml — Rich Text Editor UI 구성
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

#### 4) FeedNote.fragment.xml & FeedNote.js — 댓글(ReqFeed) 피드 및 멘션 링크
ObjectPage 내 댓글 섹션으로, OData V4 Composition 자식 엔티티 `_ReqFeed`와 연동되는 소통 피드 컴포넌트입니다.

* **화면 구성 (`FeedNote.fragment.xml`)**:
  - `sap.m.FeedInput`: 수정 모드(`{ui>/isEditable}`)에 따라 활성화/비활성화 제어.
  - `sap.m.List` & `sap.m.FeedListItem`: 최신순(`FeedNum` 내림차순) 정렬, 등록자, 등록일시, 본문 바인딩 및 삭제 액션(`FeedListItemAction`) 제공.
* **로직 및 멘션 링크 (`FeedNote.js` & `ObjectPageExt.controller.js`)**:
  - `onPostFeed`: OData V4 바인딩의 `create` 메서드를 통해 초안(Draft) 상태로 댓글 생성.
  - `onDeleteFeed`: `MessageBox.confirm` 확인 후 선택된 댓글 컨텍스트의 `delete()` 실행.
  - **스마트 멘션 기능**: 본문 내 `@홍길동` 및 `#홍길동(변경권한추가)` 패턴을 감지하여 운영담당자 앱(`ZSPF_OPERMANAGER-display`)으로 이동하는 Semantic FLP 링크(`<a>` 태그)로 자동 변환.
* **스타일 처리 (`editor.css`)**:
  - 조회(Disabled) 모드에서도 아바타가 흐려지지 않고 명확하게 유지되며, 안내 문구가 스타일링된 상태로 입력이 방지되도록 CSS 확장 적용.

```javascript
// FeedNote.js — 멘션 변환 예시
function _processMentions(sText) {
    // #홍길동 or #홍길동(변경권한추가) -> 담당자 앱 URL 생성
    sResult = sResult.replace(/#([a-zA-Z0-9가-힣_-]+)(?:\(변경권한추가\))?/g, function (match, sName) {
        var sUrl = _buildUrl(sName);
        return '<a href="' + sUrl + '">#' + sName + '(변경권한추가)</a>';
    });
    // @홍길동 -> 담당자 앱 URL 생성
    sResult = sResult.replace(/@([a-zA-Z0-9가-힣_-]+)/g, function (match, sName) {
        var sUrl = _buildUrl(sName);
        return '<a href="' + sUrl + '">@' + sName + '</a>';
    });
    return sResult;
}
```

#### 5) Selection Fields 및 Side Effects 구성

* **진행담당자(ProManager) 헤더 중복 해결 및 Navigation Path 필터링 (`_Promanager/Manager`)**:
  - 헤더 FilterBar 조회를 위해 `ZSP_ITSM_R_REQUEST`에 1:N 자식 테이블(`zsp_itsm_0041`)을 직접 조인했던 결함으로 인해 동일한 요청이 여러 행으로 중복 출력되던 문제를 해결했습니다.
  - CTS `SPDK903932`를 통해 CDS 루트 뷰(`ZSP_ITSM_R_REQUEST`), 프로젝션 뷰(`zsp_itsm_p_request`), MDE에서 잘못 투영되었던 `ProManager` 필드 및 `_ProgMng` 조인을 완전히 제거하여 루트 엔티티의 1건당 1행 유일성을 정상 복원했습니다.
  - Fiori Elements 상단 FilterBar에서의 진행담당자 검색은 `zspf_custmaster`와 동일한 정석 방식으로, 로컬 어노테이션(`annotation.xml`)의 `UI.SelectionFields`에 자식 엔티티 내비게이션 경로인 `<PropertyPath>_Promanager/Manager</PropertyPath>`를 정의하여 데이터 복제 없이 담당자별 필터 조회가 정상 동작하도록 최적화했습니다.

* **Side Effects (필드 변경 즉각 동기화)**:
  - RAP 백엔드의 Determination 로직(`setDefault`, `setManHours`)에 맞춰 사용자가 값을 변경하는 즉시 UI 필드가 재계산/동기화되도록 OData V4 Side Effects를 구성했습니다.
    - `CustnoChange`: 고객업체코드(`Custno`) 입력 시 고객명, 고객담당자, 기본 요청일, 기본 난이도/우선순위, 공수시간 동시 갱신.
    - `ReqTypeChange`: 요청유형(`ReqType`) 변경 시 유형 텍스트 및 기준 공수시간(`ManHours`) 갱신.
    - `ZlevelChange`: 난이도(`Zlevel`) 변경 시 난이도 텍스트 및 기준 공수시간(`ManHours`) 갱신.
    - `AttachmentChange`: 첨부파일 추가/삭제 시 첨부파일 테이블 상태 갱신.

```xml
<Annotation Term="Common.SideEffects" Qualifier="CustnoChange">
    <Record Type="Common.SideEffectsType">
        <PropertyValue Property="SourceProperties">
            <Collection>
                <PropertyPath>Custno</PropertyPath>
            </Collection>
        </PropertyValue>
        <PropertyValue Property="TargetProperties">
            <Collection>
                <PropertyPath>Custname</PropertyPath>
                <PropertyPath>Persno</PropertyPath>
                <PropertyPath>Persname</PropertyPath>
                <PropertyPath>ReqDate</PropertyPath>
                <PropertyPath>Zlevel</PropertyPath>
                <PropertyPath>LevelText</PropertyPath>
                <PropertyPath>Ranks</PropertyPath>
                <PropertyPath>RankText</PropertyPath>
                <PropertyPath>ManHours</PropertyPath>
            </Collection>
        </PropertyValue>
    </Record>
</Annotation>
```

#### 6) Cross-App Navigation 필터 정리 및 감사 필드 제한

고객마스터(`zspf_custmaster`) 등 외부 앱에서 Cross-App Navigation(의도된 `Custno` 전달)을 통해 본 앱의 ListReport로 진입할 때, 원치 않는 필터(예: `CreatedBy`, `CreatedAt` 등 공통 감사 필드)가 FilterBar에 유입되어 검색 조건이 왜곡되는 현상을 방지하도록 다계층 보호 로직을 구현했습니다.

* **manifest.json (Inbound 파라미터 제약)**:
  - 인바운드 네비게이션 시 `Custno`만 선택적 허용하고, 기타 미정의 파라미터는 무시(`additionalParameters: "ignored"`)하도록 선언.
  - `ListReportController` 확장을 등록:
  ```json
  "sap.ui5": {
    "extends": {
      "extensions": {
        "sap.ui.controllerExtensions": {
          "sap.fe.templates.ListReport.ListReportController": {
            "controllerName": "zsp.itsm.zspfrequest.ext.controller.ListReportExt"
          }
        }
      }
    }
  }
  ```
* **Component.js (초기 파라미터 필터링)**:
  - `init` 생명주기에서 `oComponentData.startupParameters`를 가로채어 감사 필드(`CreatedBy`, `CreatedAt`, `LastChangedBy` 등)를 선제 삭제.
* **ListReportExt.controller.js (동적 외부 상태 정제)**:
  - `sap-xapp-state` 진입 시 `sap/ui/mdc/p13n/StateUtil`을 사용하여 FilterBar의 상태를 조회한 뒤, 화이트리스트(`Custno`, FE 내부 `$editState`)에 속하지 않는 필터 조건을 `filtered: false, visible: false`로 동적 제거(Delta 처리)하고 자동 검색(`triggerSearch`)을 수행.

#### 7) 완료일변경 (changeRealDate) 액션 인스턴스 기본값 바인딩

* **기존 완료일 자동 세팅**:
  - `changeRealDate` 팝업 파라미터 엔티티 `ZSP_ITSM_A_REALDATE`에 `@UI.defaultValue: #( 'ELEMENT_OF_REFERENCED_ENTITY: RealDate' )` 어노테이션을 부여하여, Fiori Elements 표준 다이얼로그가 열릴 때 해당 행의 기존 완료일(`RealDate`)이 기본값으로 자동 바인딩되도록 구성했습니다.
  - 인스턴스 Feature Control을 통해 진행상태가 완료(`'S'`)인 건에 대해서만 액션 버튼이 활성화됩니다.

#### 8) 진행담당자(_Promanager/Manager) 필터바 설정 및 헤더 중복 방지

* **헤더 데이터 중복(Duplicate Rows) 원천 차단**:
  - 1:N 관계인 진행담당자(`zsp_itsm_0041`)를 루트 CDS 뷰(`ZSP_ITSM_R_REQUEST`)에 직접 조인하여 헤더 필드로 노출하던 이전 방식은 담당자가 복수인 요청 건에서 헤더 레코드가 N개로 증식되는 문제가 있었습니다.
  - 헤더 뷰의 1:N 직접 조인 필드를 제거하고, 순수 Composition 네비게이션(`_Promanager`)으로만 관계를 유지하도록 백엔드(CTS: `SPDK903932`)를 정비했습니다.
* **UI5 FilterBar 네비게이션 필터 구성**:
  - `annotation.xml`: `UI.SelectionFields` 컬렉션에 `<PropertyPath>_Promanager/Manager</PropertyPath>`를 정의하여 네비게이션 필터링 지원.
  - `manifest.json`: `MainList`의 `controlConfiguration`에 `@com.sap.vocabularies.UI.v1.SelectionFields` 설정을 추가하고, `_Promanager/Manager`의 `availability`를 `"Default"`로 지정하여 별도 Adapt Filters 조작 없이도 필터바에 즉시 노출되도록 구성.
* **OData V4 Lambda 필터링 동작**:
  - UI5 필터바에서 진행담당자를 지정하면 OData V4 `$filter=_Promanager/any(d:d/Manager eq '...')` 요청이 발생하며, SAP Gateway/RAP 엔진이 이를 `EXISTS` 서브쿼리로 처리하므로 헤더 건수의 왜곡 및 중복 행 없이 해당 담당자가 포함된 요청만 정확하게 조회됩니다.

