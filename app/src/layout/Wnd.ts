import {Layout} from "./index";
import {genUUID} from "../util/genID";
import {
    fixWndFlex1,
    getInstanceById,
    getWndByLayout,
    JSONToCenter,
    newModelByInitData,
    pdfIsLoading,
    saveLayout,
    setPanelFocus,
    switchWnd
} from "./util";
import {Tab} from "./Tab";
import {Model} from "./Model";
import {Editor} from "../editor";
import {Graph} from "./dock/Graph";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    isInEmbedBlock
} from "../protyle/util/hasClosest";
import {Constants} from "../constants";
/// #if !BROWSER
import {ipcRenderer, webFrame} from "electron";
import {setModelsHash, setTabPosition} from "../window/setHeader";
/// #endif
import {Search} from "../search";
import {showMessage} from "../dialog/message";
import {openFileById, updatePanelByEditor} from "../editor/util";
import {scrollCenter} from "../util/highlightById";
import {getAllModels} from "./getAll";
import {clearCounter} from "./status";
import {saveScroll} from "../protyle/scroll/saveScroll";
import {Asset} from "../asset";
import {newFile} from "../util/newFile";
import {MenuItem} from "../menus/Menu";
import {escapeHtml} from "../util/escape";
import {getFrontend, isWindow} from "../util/functions";
import {hideAllElements} from "../protyle/ui/hideElements";
import {focusByOffset, getSelectionOffset} from "../protyle/util/selection";
import {Custom} from "./dock/Custom";
import {App} from "../index";
import {unicode2Emoji} from "../emoji";
import {closeWindow} from "../window/closeWin";
import {setTitle} from "../dialog/processSystem";
import {newCenterEmptyTab, resizeTabs} from "./tabUtil";
import {fullscreen} from "../protyle/breadcrumb/action";
import {setPadding} from "../protyle/ui/initUI";
import {setPosition} from "../util/setPosition";
import {clearOBG} from "./dock/util";
import {recordBeforeResizeTop} from "../protyle/util/resize";

export class Wnd {
    private app: App;
    public id: string;
    public parent?: Layout;
    public element: HTMLElement;
    public headersElement: HTMLElement;
    public children: Tab[] = [];
    public resize?: Config.TUILayoutDirection;

    constructor(app: App, resize?: Config.TUILayoutDirection, parentType?: Config.TUILayoutType) {
        this.id = genUUID();
        this.app = app;
        this.resize = resize;
        this.element = document.createElement("div");
        this.element.classList.add("fn__flex-1", "fn__flex");
        let dragHTML = '<div class="layout-tab-container__drag fn__none"></div>';
        if (parentType === "left" || parentType === "right" || parentType === "bottom") {
            dragHTML = "";
        }
        this.element.innerHTML = `<div data-type="wnd" data-id="${this.id}" class="fn__flex-column fn__flex fn__flex-1">
    <div class="fn__flex fn__none">
        <ul class="fn__flex layout-tab-bar"></ul>
        <ul class="layout-tab-bar layout-tab-bar--readonly fn__flex-1">
            <li class="item item--readonly">
                <span data-type="new" class="block__icon block__icon--show ariaLabel${window.siyuan.config.readonly ? " fn__none" : ""}" aria-label="${window.siyuan.languages.newFile}"><svg><use xlink:href="#iconAdd"></use></svg></span>
                <span class="fn__flex-1"></span>
                <span data-type="more" data-menu="true" class="block__icon block__icon--show ariaLabel" aria-label="${window.siyuan.languages.switchTab}"><svg><use xlink:href="#iconDown"></use></svg></span>
            </li>
        </ul>
    </div>
    <div class="layout-tab-container fn__flex-1">${dragHTML}</div>
</div>`;
        this.headersElement = this.element.querySelector(".layout-tab-bar");
        const dragElement = this.element.querySelector(".layout-tab-container__drag") as HTMLElement;
        if (!dragElement) {
            return;
        }
        this.headersElement.addEventListener("mousedown", (event) => {
            // 点击鼠标滚轮关闭
            if (event.button !== 1) {
                return;
            }
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.headersElement)) {
                if (target.tagName === "LI") {
                    this.removeTab(target.getAttribute("data-id"));
                    window.siyuan.menus.menu.remove();
                    event.stopPropagation();
                    event.preventDefault();
                    const frontend = getFrontend();
                    if ((["desktop", "desktop-window"].includes(frontend) && window.siyuan.config.system.os === "linux") ||
                        (frontend === "browser-desktop" && navigator.userAgent.indexOf("Linux") !== -1)) {
                        const activeElement = document.activeElement;
                        window.addEventListener("paste", this.#preventPast, {
                            capture: true,
                            once: true
                        });
                        // TODO 保持原有焦点？https://github.com/siyuan-note/siyuan/pull/13395/files#r1877004077
                        if (activeElement instanceof HTMLElement) {
                            activeElement.focus();
                        }
                        // 如果在短时间内没有 paste 事件发生,移除监听
                        setTimeout(() => {
                            window.removeEventListener("paste", this.#preventPast, {
                                capture: true
                            });
                        }, Constants.TIMEOUT_INPUT);
                    }
                    break;
                }
                target = target.parentElement;
            }
        });
        this.headersElement.addEventListener("mousewheel", (event: WheelEvent) => {
            this.headersElement.scrollLeft = this.headersElement.scrollLeft + event.deltaY;
        }, {passive: true});

        this.headersElement.parentElement.addEventListener("click", (event) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.headersElement)) {
                if (target.classList.contains("block__icon") && target.getAttribute("data-type") === "new") {
                    setPanelFocus(this.headersElement.parentElement.parentElement);
                    newFile({
                        app,
                        useSavePath: true
                    });
                    break;
                } else if (target.classList.contains("block__icon") && target.getAttribute("data-type") === "more") {
                    this.renderTabList(target);
                    break;
                } else if (target.tagName === "LI" && target.getAttribute("data-id") && !pdfIsLoading(this.element)) {
                    if (target.classList.contains("item--focus")) {
                        this.switchTab(target, true, true, false, false);
                    } else {
                        this.switchTab(target, true);
                    }
                    break;
                }
                target = target.parentElement;
            }
        });
        this.headersElement.parentElement.addEventListener("dblclick", (event) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.headersElement)) {
                if (window.siyuan.config.fileTree.openFilesUseCurrentTab && target.getAttribute("data-type") === "tab-header") {
                    target.classList.remove("item--unupdate");
                    break;
                }
                target = target.parentElement;
            }
        });
        this.headersElement.parentElement.addEventListener("dragover", function (event: DragEvent & {
            target: HTMLElement
        }) {
            const it = this as HTMLElement;
            if (!window.siyuan.currentDragOverTabHeadersElement) {
                window.siyuan.currentDragOverTabHeadersElement = it;
            } else {
                if (!window.siyuan.currentDragOverTabHeadersElement.isSameNode(it)) {
                    window.siyuan.currentDragOverTabHeadersElement.classList.remove("layout-tab-bars--drag");
                    window.siyuan.currentDragOverTabHeadersElement.querySelectorAll(".layout-tab-bar li[data-clone='true']").forEach(item => {
                        item.remove();
                    });
                    window.siyuan.currentDragOverTabHeadersElement = it;
                }
            }
            if (event.dataTransfer.types.includes(Constants.SIYUAN_DROP_FILE)) {
                event.preventDefault();
                it.classList.add("layout-tab-bars--drag");
                return;
            }
            // 不能使用 !window.siyuan.dragElement，因为移动页签到新窗口后，再把主窗口页签拖拽新窗口页签上时，该值为空
            if (!event.dataTransfer.types.includes(Constants.SIYUAN_DROP_TAB)) {
                return;
            }
            event.preventDefault();
            let oldTabHeaderElement = window.siyuan.dragElement;
            let exitDrag = false;
            Array.from(it.firstElementChild.childNodes).find((item: HTMLElement) => {
                if (item.style?.opacity === "0.38") {
                    oldTabHeaderElement = item;
                    exitDrag = true;
                    return true;
                }
            });
            if (!exitDrag && oldTabHeaderElement) {
                if (oldTabHeaderElement.classList.contains("item--pin")) {
                    return;
                }
                oldTabHeaderElement = oldTabHeaderElement.cloneNode(true) as HTMLElement;
                oldTabHeaderElement.setAttribute("data-clone", "true");
                it.firstElementChild.append(oldTabHeaderElement);
                return;
            } else if (!exitDrag && !oldTabHeaderElement) { // 拖拽到新窗口
                oldTabHeaderElement = document.createElement("li");
                oldTabHeaderElement.style.opacity = "0.38";
                oldTabHeaderElement.innerHTML = '<svg class="svg"><use xlink:href="#iconFile"></use></svg>';
                oldTabHeaderElement.setAttribute("data-clone", "true");
                it.firstElementChild.append(oldTabHeaderElement);
            }
            const newTabHeaderElement = hasClosestByAttribute(event.target, "data-type", "tab-header");
            if (!newTabHeaderElement) {
                if (!oldTabHeaderElement.classList.contains("item--pin")) {
                    it.classList.add("layout-tab-bars--drag");
                }
                return;
            }
            it.classList.remove("layout-tab-bars--drag");
            if (!newTabHeaderElement.isSameNode(oldTabHeaderElement) &&
                ((oldTabHeaderElement.classList.contains("item--pin") && newTabHeaderElement.classList.contains("item--pin")) ||
                    (!oldTabHeaderElement.classList.contains("item--pin") && !newTabHeaderElement.classList.contains("item--pin")))) {
                const rect = newTabHeaderElement.getClientRects()[0];
                if (event.clientX > rect.left + rect.width / 2) {
                    newTabHeaderElement.after(oldTabHeaderElement);
                } else {
                    newTabHeaderElement.before(oldTabHeaderElement);
                }
            }
        });
        this.headersElement.parentElement.addEventListener("drop", function (event: DragEvent & {
            target: HTMLElement
        }) {
            document.querySelectorAll(".layout-tab-bars--drag").forEach(item => {
                item.classList.remove("layout-tab-bars--drag");
            });
            const it = this as HTMLElement;
            if (event.dataTransfer.types.includes(Constants.SIYUAN_DROP_FILE)) {
                // 文档树拖拽
                setPanelFocus(it.parentElement);
                event.dataTransfer.getData(Constants.SIYUAN_DROP_FILE).split(",").forEach(item => {
                    if (item) {
                        openFileById({
                            app,
                            id: item,
                            action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL]
                        });
                    }
                });
                window.siyuan.dragElement = undefined;
                return;
            }
            const tabData = JSON.parse(event.dataTransfer.getData(Constants.SIYUAN_DROP_TAB));
            let oldTab = getInstanceById(tabData.id) as Tab;
            const wnd = getInstanceById(it.parentElement.getAttribute("data-id")) as Wnd;
            /// #if !BROWSER
            if (!oldTab) { // 从主窗口拖拽到页签新窗口
                if (wnd instanceof Wnd) {
                    JSONToCenter(app, tabData, wnd);
                    oldTab = wnd.children[wnd.children.length - 1];
                    ipcRenderer.send(Constants.SIYUAN_SEND_WINDOWS, {cmd: "closetab", data: tabData.id});
                    it.querySelector("li[data-clone='true']").remove();
                    wnd.switchTab(oldTab.headElement);
                    ipcRenderer.send(Constants.SIYUAN_CMD, "focus");
                }
            }
            /// #endif
            if (!oldTab) {
                return;
            }

            const nextTabHeaderElement = (Array.from(it.firstElementChild.childNodes).find((item: HTMLElement) => {
                if (item.style?.opacity === "0.38") {
                    return true;
                }
            }) as HTMLElement)?.nextElementSibling;

            if (!it.contains(oldTab.headElement)) {
                // 从其他 Wnd 拖动过来
                const cloneTabElement = it.querySelector("[data-clone='true']");
                if (!cloneTabElement) {
                    return;
                }
                cloneTabElement.before(oldTab.headElement);
                cloneTabElement.remove();
                // 对象顺序
                wnd.moveTab(oldTab, nextTabHeaderElement ? nextTabHeaderElement.getAttribute("data-id") : undefined);
                resizeTabs();
                return;
            }

            let tempTab: Tab;
            oldTab.parent.children.find((item, index) => {
                if (item.id === oldTab.id) {
                    tempTab = oldTab.parent.children.splice(index, 1)[0];
                    return true;
                }
            });
            if (nextTabHeaderElement) {
                oldTab.parent.children.find((item, index) => {
                    if (item.id === nextTabHeaderElement.getAttribute("data-id")) {
                        oldTab.parent.children.splice(index, 0, tempTab);
                        return true;
                    }
                });
            } else {
                oldTab.parent.children.push(tempTab);
            }
            saveLayout();
        });
        let elementDragCounter = 0;
        this.element.addEventListener("dragenter", (event: DragEvent & { target: HTMLElement }) => {
            elementDragCounter++;
            if (event.dataTransfer.types.includes(Constants.SIYUAN_DROP_TAB)) {
                const tabHeadersElement = hasClosestByClassName(event.target, "layout-tab-bar");
                if (tabHeadersElement) {
                    return;
                }
                const tabPanelsElement = hasClosestByClassName(event.target, "layout-tab-container", true);
                if (tabPanelsElement) {
                    dragElement.classList.remove("fn__none");
                    this.updateDragElement(event, dragElement.parentElement.getBoundingClientRect(), dragElement);
                }
            }
        });
        //  dragElement dragleave 后还会触发 dragenter https://github.com/siyuan-note/siyuan/issues/13753
        this.element.addEventListener("dragleave", () => {
            elementDragCounter--;
            if (elementDragCounter === 0) {
                dragElement.classList.add("fn__none");
                dragElement.removeAttribute("style");
            }
        });

        dragElement.addEventListener("dragover", (event: DragEvent & { layerX: number, layerY: number }) => {
            document.querySelectorAll(".layout-tab-bars--drag").forEach(item => {
                item.classList.remove("layout-tab-bars--drag");
            });
            event.preventDefault();
            if (!dragElement.nextElementSibling) {
                return;
            }
            this.updateDragElement(event, dragElement.parentElement.getBoundingClientRect(), dragElement);
        });

        dragElement.addEventListener("dragleave", () => {
            dragElement.classList.add("fn__none");
            dragElement.removeAttribute("style");
        });

        dragElement.addEventListener("drop", (event: DragEvent & { target: HTMLElement }) => {
            dragElement.classList.add("fn__none");
            const targetWndElement = event.target.parentElement.parentElement;
            const targetWnd = getInstanceById(targetWndElement.getAttribute("data-id")) as Wnd;
            const tabData = JSON.parse(event.dataTransfer.getData(Constants.SIYUAN_DROP_TAB));
            let oldTab = getInstanceById(tabData.id) as Tab;
            /// #if !BROWSER
            if (!oldTab) { // 从主窗口拖拽到页签新窗口
                JSONToCenter(app, tabData, this);
                this.children.find(item => {
                    if (item.headElement.getAttribute("data-activeTime") === tabData.activeTime) {
                        oldTab = item;
                        return true;
                    }
                });
                ipcRenderer.send(Constants.SIYUAN_SEND_WINDOWS, {cmd: "closetab", data: tabData.id});
                ipcRenderer.send(Constants.SIYUAN_CMD, "focus");
            }
            /// #endif
            if (!oldTab) {
                dragElement.removeAttribute("style");
                return;
            }

            if (dragElement.style.height === "50%" || dragElement.style.width === "50%") {
                // split
                if (dragElement.style.height === "50%") {
                    // split to bottom
                    const newWnd = targetWnd.split("tb");
                    newWnd.headersElement.append(oldTab.headElement);
                    newWnd.headersElement.parentElement.classList.remove("fn__none");
                    newWnd.moveTab(oldTab);

                    if (dragElement.style.bottom === "50%" && newWnd.element.previousElementSibling && targetWnd.element.parentElement) {
                        // 交换位置
                        switchWnd(newWnd, targetWnd);
                    }
                } else if (dragElement.style.width === "50%") {
                    // split to right
                    const newWnd = targetWnd.split("lr");
                    newWnd.headersElement.append(oldTab.headElement);
                    newWnd.headersElement.parentElement.classList.remove("fn__none");
                    newWnd.moveTab(oldTab);

                    if (dragElement.style.right === "50%" && newWnd.element.previousElementSibling && targetWnd.element.parentElement) {
                        // 交换位置
                        switchWnd(newWnd, targetWnd);
                    }
                }
                resizeTabs();
                /// #if !BROWSER
                setTabPosition();
                /// #endif
                dragElement.removeAttribute("style");
                return;
            }
            dragElement.removeAttribute("style");
            if (targetWndElement.contains(document.querySelector(`[data-id="${tabData.id}"]`))) {
                return;
            }
            if (targetWnd) {
                recordBeforeResizeTop();
                targetWnd.headersElement.append(oldTab.headElement);
                targetWnd.headersElement.parentElement.classList.remove("fn__none");
                targetWnd.moveTab(oldTab);
                resizeTabs();
            }
        });
    }

    private isPointWithinLines(x: number, y: number, line1: { k: number, b: number }, line2: {
        k: number,
        b: number
    }): boolean {
        const y1 = line1.k * x + line1.b;
        const y2 = line2.k * x + line2.b;
        return (y >= Math.min(y1, y2) && y <= Math.max(y1, y2));
    }

    private updateDragElement(event: DragEvent, rect: DOMRect, dragElement: HTMLElement) {
        const height = rect.height;
        const width = rect.width;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (x < width / 5 && this.isPointWithinLines(x, y, {
            // 左上角 (0.1w, 0); (0.2w, 0.15h)
            k: 1.5 * height / width, b: -0.15 * height
        }, {
            // 左下角 (0.04w, h); (0.2w, 0.8h)
            k: -1.25 * height / width, b: 1.05 * height
        })) {
            dragElement.setAttribute("style", "height:100%;width:50%;right:50%;bottom:0;left:0;top:0");
        } else if (x > width * 0.8 && this.isPointWithinLines(x, y, {
            // 右上角 (0.9w, 0); (0.8w, 0.15h)
            k: -1.5 * height / width, b: 1.35 * height
        }, {
            // 右下角 (0.96w, h); (0.8w, 0.8h)
            k: 1.25 * height / width, b: -0.2 * height
        })) {
            dragElement.setAttribute("style", "height:100%;width:50%;right:0;bottom:0;left:50%;top:0");
        } else if (y < height * .15) {
            dragElement.setAttribute("style", "height:50%;width:100%;right:0;bottom:50%;left:0;top:0");
        } else if (y > height * .8) {
            dragElement.setAttribute("style", "height:50%;width:100%;right:0;bottom:0;left:0;top:50%");
        } else {
            dragElement.setAttribute("style", "height:100%;width:100%;right:0;bottom:0;left:0;top:0");
        }
    };

    public showHeading() {
        const currentElement = this.headersElement.querySelector(".item--focus") as HTMLElement;
        if (!currentElement) {
            return;
        }
        if (currentElement.offsetLeft + currentElement.clientWidth > this.headersElement.scrollLeft + this.headersElement.clientWidth) {
            this.headersElement.scrollLeft = currentElement.offsetLeft + currentElement.clientWidth - this.headersElement.clientWidth;
        } else if (currentElement.offsetLeft < this.headersElement.scrollLeft) {
            this.headersElement.scrollLeft = currentElement.offsetLeft;
        }
    }

    public switchTab(target: HTMLElement, pushBack = false, update = true, resize = true, isSaveLayout = true) {
        let currentTab: Tab;
        let isInitActive = false;
        this.children.forEach((item) => {
            if (target === item.headElement) {
                if (item.headElement && item.headElement.classList.contains("fn__none")) {
                    // https://github.com/siyuan-note/siyuan/issues/267
                } else {
                    if (item.headElement) {
                        item.headElement.classList.add("item--focus");
                        if (item.headElement.getAttribute("data-init-active") === "true") {
                            item.headElement.removeAttribute("data-init-active");
                            isInitActive = true;
                        } else {
                            item.headElement.setAttribute("data-activetime", (new Date()).getTime().toString());
                        }
                    }
                    item.panelElement.classList.remove("fn__none");
                }
                currentTab = item;
            } else {
                item.headElement?.classList.remove("item--focus");
                if (!item.panelElement.classList.contains("fn__none")) {
                    // 必须现判断，否则会触发 observer.observe(this.element, {attributeFilter: ["class"]}); 导致 https://ld246.com/article/1641198819303
                    item.panelElement.classList.add("fn__none");
                }
            }
        });
        // 在 JSONToLayout 中进行 focus
        if (!isInitActive) {
            setPanelFocus(this.headersElement.parentElement.parentElement, isSaveLayout);
        }
        if (currentTab && currentTab.headElement) {
            const initData = currentTab.headElement.getAttribute("data-initdata");
            if (initData) {
                currentTab.addModel(newModelByInitData(this.app, currentTab, JSON.parse(initData)));
                currentTab.headElement.removeAttribute("data-initdata");
                if (isSaveLayout) {
                    saveLayout();
                }
                return;
            }
        }

        if (currentTab && target === currentTab.headElement) {
            if (currentTab.model instanceof Graph) {
                currentTab.model.onGraph(false);
            } else if (currentTab.model instanceof Asset && currentTab.model.pdfObject && currentTab.model.pdfObject.pdfViewer) {
                // https://github.com/siyuan-note/siyuan/issues/5655
                currentTab.model.pdfObject.pdfViewer.container.focus();
            }
        }

        if (currentTab && currentTab.model instanceof Editor) {
            const keepCursorId = currentTab.headElement.getAttribute("keep-cursor");
            if (keepCursorId) {
                // 在新页签中打开，但不跳转到新页签，但切换到新页签时需调整滚动
                let nodeElement: HTMLElement;
                Array.from(currentTab.model.editor.protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${keepCursorId}"]`)).find((item: HTMLElement) => {
                    if (!isInEmbedBlock(item)) {
                        nodeElement = item;
                        return true;
                    }
                });
                if (nodeElement) {
                    if (!currentTab.model.editor.protyle.toolbar.range) {
                        const range = document.createRange();
                        range.selectNodeContents(nodeElement);
                        range.collapse();
                        currentTab.model.editor.protyle.toolbar.range = range;
                    }
                    scrollCenter(currentTab.model.editor.protyle, nodeElement, true);
                } else {
                    openFileById({
                        app: this.app,
                        id: keepCursorId,
                        action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL]
                    });
                }
                currentTab.headElement.removeAttribute("keep-cursor");
            }
            // focusin 触发前，layout__wnd--active 和 tab 已设置，需在调用里面更新
            if (update) {
                updatePanelByEditor({
                    protyle: currentTab.model.editor.protyle,
                    focus: true,
                    pushBackStack: pushBack,
                    reload: false,
                    resize,
                });
            }
            if (window.siyuan.editorIsFullscreen) {
                fullscreen(currentTab.model.editor.protyle.element);
                setPadding(currentTab.model.editor.protyle);
            }
        } else {
            clearOBG();
        }
        if (isSaveLayout) {
            saveLayout();
        }
    }

    public addTab(tab: Tab, keepCursor = false, isSaveLayout = true, activeTime?: string) {
        if (keepCursor) {
            tab.headElement?.classList.remove("item--focus");
            tab.panelElement.classList.add("fn__none");
        }
        let oldFocusIndex = 0;
        this.children.forEach((item, index) => {
            if (item.headElement && item.headElement.classList.contains("item--focus")) {
                oldFocusIndex = index;
                let nextElement = item.headElement.nextElementSibling;
                while (nextElement && nextElement.classList.contains("item--pin")) {
                    oldFocusIndex++;
                    nextElement = nextElement.nextElementSibling;
                }
            }
            if (!keepCursor) {
                item.headElement?.classList.remove("item--focus");
                item.panelElement.classList.add("fn__none");
            }
        });

        this.children.splice(oldFocusIndex + 1, 0, tab);

        if (tab.headElement) {
            this.headersElement.parentElement.classList.remove("fn__none");
            if (this.headersElement.childElementCount === 0) {
                this.headersElement.append(tab.headElement);
            } else {
                this.headersElement.children[oldFocusIndex].after(tab.headElement);
            }
            tab.headElement.querySelector(".item__close").addEventListener("click", (event) => {
                if (tab.headElement.classList.contains("item--pin")) {
                    tab.unpin();
                } else {
                    tab.parent.removeTab(tab.id);
                }
                window.siyuan.menus.menu.remove();
                event.stopPropagation();
                event.preventDefault();
            });
            tab.headElement.setAttribute("data-activetime", activeTime || (new Date()).getTime().toString());
        }
        const containerElement = this.element.querySelector(".layout-tab-container");
        if (!containerElement.querySelector(".fn__flex-1")) {
            // empty center
            containerElement.append(tab.panelElement);
        } else if (!containerElement.querySelector(".layout-tab-container__drag")) {
            // Dock
            containerElement.children[oldFocusIndex].after(tab.panelElement);
        } else {
            containerElement.children[oldFocusIndex + 1].after(tab.panelElement);
        }

        tab.parent = this;
        if (tab.callback) {
            tab.callback(tab);
        }
        // 移除 centerLayout 中的 empty
        if (this.parent.type === "center" && this.children.length === 2 && !this.children[0].headElement) {
            this.removeTab(this.children[0].id);
        } else if (this.children.length > window.siyuan.config.fileTree.maxOpenTabCount) {
            this.removeOverCounter(isSaveLayout);
        }
        /// #if !BROWSER
        setTabPosition();
        setModelsHash();
        /// #endif
        if (isSaveLayout) {
            saveLayout();
        }
    }

    #preventPast(event: ClipboardEvent) {
        event.preventDefault();
        event.stopPropagation();
    }

    private renderTabList(target: HTMLElement) {
        if (!window.siyuan.menus.menu.element.classList.contains("fn__none") &&
            window.siyuan.menus.menu.element.getAttribute("data-name") === "tabList") {
            window.siyuan.menus.menu.remove();
            return;
        }
        window.siyuan.menus.menu.remove();
        window.siyuan.menus.menu.element.classList.add("b3-menu--list");
        Array.from(this.headersElement.children).forEach((item: HTMLElement) => {
            const iconElement = item.querySelector(".item__icon");
            const graphicElement = item.querySelector(".item__graphic");
            let iconHTML = undefined;
            if (iconElement) {
                if (iconElement.firstElementChild?.tagName === "IMG") {
                    // 图标为图片的文档
                    iconHTML = `<img src="${iconElement.firstElementChild.getAttribute("src")}"  class="b3-menu__icon">`;
                } else {
                    // 有图标的文档
                    iconHTML = `<span class="b3-menu__icon">${iconElement.innerHTML}</span>`;
                }
            } else if (!graphicElement) {
                // 没有图标的文档
                iconHTML = unicode2Emoji(window.siyuan.storage[Constants.LOCAL_IMAGES].file, "b3-menu__icon", true);
            }
            window.siyuan.menus.menu.append(new MenuItem({
                label: escapeHtml(item.querySelector(".item__text").textContent),
                action: "iconCloseRound",
                iconHTML,
                icon: graphicElement ? graphicElement.firstElementChild.getAttribute("xlink:href").substring(1) : "",
                bind: (element) => {
                    element.addEventListener("click", (itemEvent) => {
                        if (hasClosestByClassName(itemEvent.target as Element, "b3-menu__action")) {
                            this.removeTab(item.getAttribute("data-id"));
                            if (element.previousElementSibling || element.nextElementSibling) {
                                element.remove();
                                setPosition(window.siyuan.menus.menu.element, rect.left + rect.width - window.siyuan.menus.menu.element.clientWidth, rect.top + rect.height);
                            } else {
                                window.siyuan.menus.menu.remove();
                            }
                        } else {
                            this.switchTab(item, true);
                            this.showHeading();
                            window.siyuan.menus.menu.remove();
                        }
                        itemEvent.preventDefault();
                        itemEvent.stopPropagation();
                    });
                },
                current: item.classList.contains("item--focus")
            }).element);
        });
        window.siyuan.menus.menu.element.setAttribute("data-name", "tabList");
        const rect = target.getBoundingClientRect();
        window.siyuan.menus.menu.popup({
            x: rect.left + rect.width,
            y: rect.top + rect.height,
            isLeft: true
        });
    }

    private removeOverCounter(isSaveLayout = false) {
        let removeId: string;
        let openTime: string;
        let removeCount = 0;
        this.children.forEach((item, index) => {
            if (!item.headElement) {
                return;
            }
            if (item.headElement.classList.contains("item--pin") || item.headElement.classList.contains("item--focus")) {
                return;
            }
            removeCount++;
            if (!openTime) {
                openTime = item.headElement.getAttribute("data-activetime");
                removeId = this.children[index].id;
            } else if (item.headElement.getAttribute("data-activetime") < openTime) {
                openTime = item.headElement.getAttribute("data-activetime");
                removeId = this.children[index].id;
            }
        });
        if (removeId) {
            this.removeTab(removeId, false, false, isSaveLayout);
            removeCount--;
        }
        if (removeCount > 0 && this.children.length > window.siyuan.config.fileTree.maxOpenTabCount) {
            this.removeOverCounter(isSaveLayout);
        }
    }

    private destroyModel(model: Model) {
        if (!model) {
            return;
        }
        if (model instanceof Editor && model.editor) {
            window.siyuan.blockPanels.forEach((item) => {
                if (item.element && model.editor.protyle.wysiwyg.element.contains(item.element)) {
                    item.destroy();
                }
            });
            model.editor.destroy();
            return;
        }
        if (model instanceof Search) {
            model.editors.edit.destroy();
            model.editors.unRefEdit.destroy();
            return;
        }
        if (model instanceof Asset) {
            if (model.pdfObject && model.pdfObject.pdfLoadingTask) {
                model.pdfObject.pdfLoadingTask.destroy();
            }
        }
        if (model instanceof Custom) {
            if (model.destroy) {
                model.destroy();
            }
        }
        model.send("closews", {});
    }

    private removeTabAction = (id: string, closeAll = false, animate = true, isSaveLayout = true) => {
        clearCounter();
        this.children.find((item, index) => {
            if (item.id === id) {
                if (item.model instanceof Custom && item.model.beforeDestroy) {
                    item.model.beforeDestroy();
                }
                if (item.model instanceof Editor) {
                    saveScroll(item.model.editor.protyle);
                }
                if (this.children.length === 1) {
                    this.destroyModel(this.children[0].model);
                    this.children = [];
                    if (["bottom", "left", "right"].includes(this.parent.type)) {
                        item.panelElement.remove();
                    } else {
                        recordBeforeResizeTop();
                        this.remove();
                    }
                    // 关闭分屏页签后光标消失
                    const editors = getAllModels().editor;
                    if (editors.length === 0) {
                        clearOBG();
                    } else {
                        editors.forEach(item => {
                            if (!item.element.classList.contains("fn__none")) {
                                setPanelFocus(item.parent.parent.headersElement.parentElement.parentElement);
                                updatePanelByEditor({
                                    protyle: item.editor.protyle,
                                    focus: true,
                                    pushBackStack: true,
                                    reload: false,
                                    resize: true,
                                });
                                return;
                            }
                        });
                    }
                    return;
                }
                if (item.headElement) {
                    if (item.headElement.classList.contains("item--focus")) {
                        let latestHeadElement: HTMLElement;
                        Array.from(item.headElement.parentElement.children).forEach((headItem: HTMLElement) => {
                            if (!headItem.isSameNode(item.headElement) &&
                                headItem.style.maxWidth !== "0px"   // 不对比已移除但还在动画效果中的元素 https://github.com/siyuan-note/siyuan/issues/7878
                            ) {
                                if (!latestHeadElement) {
                                    latestHeadElement = headItem;
                                } else if (headItem.getAttribute("data-activetime") > latestHeadElement.getAttribute("data-activetime")) {
                                    latestHeadElement = headItem;
                                }
                            }
                        });
                        if (latestHeadElement && !closeAll) {
                            this.switchTab(latestHeadElement, true, true, false, false);
                            this.showHeading();
                        }
                    }
                    if (animate) {
                        item.headElement.setAttribute("style", "max-width: 0px;");
                        setTimeout(() => {
                            item.headElement.remove();
                        }, 200);
                    } else {
                        item.headElement.remove();
                    }
                }
                item.panelElement.remove();
                this.destroyModel(item.model);
                this.children.splice(index, 1);
                resizeTabs(false);
                return true;
            }
        });
        // 初始化移除窗口，但 centerLayout 还没有赋值 https://ld246.com/article/1658718634416
        if (window.siyuan.layout.centerLayout) {
            const wnd = getWndByLayout(window.siyuan.layout.centerLayout);
            if (!wnd) {
                /// #if !BROWSER
                if (isWindow()) {
                    closeWindow(this.app);
                    return;
                }
                /// #endif
                const wnd = new Wnd(this.app);
                window.siyuan.layout.centerLayout.addWnd(wnd);
                wnd.addTab(newCenterEmptyTab(this.app), false, false);
                setTitle(window.siyuan.languages.siyuanNote);
            }
        }
        if (isSaveLayout) {
            saveLayout();
        }
        /// #if !BROWSER
        webFrame.clearCache();
        ipcRenderer.send(Constants.SIYUAN_CMD, "clearCache");
        setTabPosition();
        setModelsHash();
        /// #endif
    };

    public removeTab(id: string, closeAll = false, animate = true, isSaveLayout = true) {
        for (let index = 0; index < this.children.length; index++) {
            const item = this.children[index];
            if (item.id === id) {
                if ((item.model instanceof Editor) && item.model.editor?.protyle) {
                    if (item.model.editor.protyle.upload.isUploading) {
                        showMessage(window.siyuan.languages.uploading);
                        return;
                    }
                    this.removeTabAction(id, closeAll, animate, isSaveLayout);
                } else {
                    this.removeTabAction(id, closeAll, animate, isSaveLayout);
                }
                return;
            }
        }
    }

    public moveTab(tab: Tab, nextId?: string) {
        let rangeData: {
            id: string,
            start: number,
            end: number
        };
        if (tab.model instanceof Editor && tab.model.editor.protyle.toolbar.range) {
            const blockElement = hasClosestBlock(tab.model.editor.protyle.toolbar.range.startContainer);
            if (blockElement) {
                const startEnd = getSelectionOffset(blockElement, undefined, tab.model.editor.protyle.toolbar.range);
                rangeData = {
                    id: blockElement.getAttribute("data-node-id"),
                    start: startEnd.start,
                    end: startEnd.end
                };
            }
        }
        this.element.querySelector(".layout-tab-container").append(tab.panelElement);
        if (rangeData && tab.model instanceof Editor) {
            // DOM 移动后 range 会变化
            const range = focusByOffset(tab.model.editor.protyle.wysiwyg.element.querySelector(`[data-node-id="${rangeData.id}"]`), rangeData.start, rangeData.end);
            if (range) {
                tab.model.editor.protyle.toolbar.range = range;
            }
        }
        if (nextId) {
            // 只能用 find https://github.com/siyuan-note/siyuan/issues/3455
            this.children.find((item, index) => {
                if (item.id === nextId) {
                    this.children.splice(index, 0, tab);
                    return true;
                }
            });
        } else {
            this.children.push(tab);
        }
        if (this.children.length > window.siyuan.config.fileTree.maxOpenTabCount) {
            this.removeOverCounter();
        }

        const oldWnd = tab.parent;
        if (oldWnd.children.length === 1) {
            oldWnd.children = [];
            oldWnd.remove();
        } else {
            oldWnd.children.find((item, index) => {
                if (item.id === tab.id) {
                    oldWnd.children.splice(index, 1);
                    resizeTabs();
                    return true;
                }
            });
            if (!oldWnd.headersElement.querySelector(".item--focus")) {
                let latestHeadElement: HTMLElement;
                Array.from(oldWnd.headersElement.children).forEach((headItem: HTMLElement) => {
                    if (!latestHeadElement) {
                        latestHeadElement = headItem;
                    } else if (headItem.getAttribute("data-activetime") > latestHeadElement.getAttribute("data-activetime")) {
                        latestHeadElement = headItem;
                    }
                });
                if (latestHeadElement) {
                    oldWnd.switchTab(latestHeadElement, true);
                }
            }
        }

        // https://github.com/siyuan-note/siyuan/issues/13551
        this.switchTab(tab.headElement);

        tab.parent = this;
        hideAllElements(["toolbar"]);
        /// #if !BROWSER
        setTabPosition();
        /// #endif
    }

    public split(direction: Config.TUILayoutDirection) {
        if (this.children.length === 1 && !this.children[0].headElement) {
            // 场景：没有打开的文档，点击标签面板打开
            return this;
        }
        const wnd = new Wnd(this.app, direction);
        if (direction === this.parent.direction) {
            this.parent.addWnd(wnd, this.id);
        } else if (this.parent.children.length === 1) {
            // layout 仅含一个时，只需更新 direction
            this.parent.direction = direction;
            if (direction === "tb") {
                this.parent.element.classList.add("fn__flex-column");
                this.parent.element.classList.remove("fn__flex");
            } else {
                this.parent.element.classList.remove("fn__flex-column");
                this.parent.element.classList.add("fn__flex");
            }
            this.parent.addWnd(wnd, this.id);
        } else {
            this.parent.children.find((item, index) => {
                if (item.id === this.id) {
                    const layout = new Layout({
                        resize: item.resize,
                        direction,
                    });
                    this.parent.addLayout(layout, item.id);
                    const movedWnd = this.parent.children.splice(index, 1)[0];
                    if (movedWnd.resize) {
                        movedWnd.element.previousElementSibling.remove();
                        movedWnd.resize = undefined;
                    }
                    layout.addWnd.call(layout, movedWnd);
                    layout.addWnd.call(layout, wnd);

                    if (direction === "tb" && movedWnd.element.style.width) {
                        layout.element.style.width = movedWnd.element.style.width;
                        layout.element.classList.remove("fn__flex-1");
                        movedWnd.element.style.width = "";
                        movedWnd.element.classList.add("fn__flex-1");
                    } else if (direction === "lr" && movedWnd.element.style.height) {
                        layout.element.style.height = movedWnd.element.style.height;
                        layout.element.classList.remove("fn__flex-1");
                        movedWnd.element.style.height = "";
                        movedWnd.element.classList.add("fn__flex-1");
                    }
                    return true;
                }
            });
        }
        return wnd;
    }

    private remove() {
        let layout = this.parent;
        let element = this.element;
        let id = this.id;
        while (layout && layout.children.length === 1 && "center" !== layout.type) {
            id = layout.id;
            element = layout.element;
            layout = layout.parent;
        }

        layout.children.find((item, index) => {
            if (item.id === id) {
                if (layout.children.length > 1) {
                    let previous = layout.children[index - 1];
                    if (index === 0) {
                        previous = layout.children[1];
                    }
                    if (layout.children.length === 2) {
                        if (layout.direction === "lr") {
                            previous.element.style.width = "";
                        } else {
                            previous.element.style.height = "";
                        }
                        previous.resize = undefined;
                        previous.element.classList.add("fn__flex-1");
                    }
                    // https://github.com/siyuan-note/siyuan/issues/5844
                    if (layout.children.length > 2 && index === 0) {
                        layout.children[1].resize = undefined;
                    }
                }
                layout.children.splice(index, 1);
                return true;
            }
        });
        if (element.previousElementSibling && element.previousElementSibling.classList.contains("layout__resize")) {
            element.previousElementSibling.remove();
        } else if (element.nextElementSibling && element.nextElementSibling.classList.contains("layout__resize")) {
            element.nextElementSibling.remove();
        }
        element.remove();
        fixWndFlex1(layout);
        resizeTabs();
    }
}
