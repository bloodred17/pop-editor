import { LitElement, css, html } from "lit";
import interact from 'interactjs'
import { customElement, property, state } from "lit/decorators.js";
import { PDFDocumentProxy, GlobalWorkerOptions, getDocument, PageViewport } from "pdfjs-dist";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';


@customElement('pop-editor')
class PopEditor extends LitElement {
  static styles = css`
  :host {
    display: block; 
    margin: 0;
    padding: 0;
  }

  .draggable {
    position: absolute;
    width: 30px;
    height: 30px;
    background-color: #29e;
    color: white;
  }

  #the-canvas {
    border: 1px solid black;
  }

  .context-menu {
    display: none;
    position: absolute;
    z-index: 10;
  }
  .context-menu--active {
    /* display: block; */
  }
  `

  @property() data: any;
  @property() url: string = '';
  @property({type: Array}) fields: string[] = ['abc'];

  @property({type: Number}) scale = 1;
  @property({type: Number}) rotation = 0;
  @property({type: Number}) pageNum = 1; //must be number
  @property({type: Number}) totalPage = 0;

  hostClientHeight: number | undefined;
  hostClientWidth: number | undefined;

  canvas: any;
  page_num = 0;
  pageCount = 0;
  pdfDoc: PDFDocumentProxy | undefined;
  pageRendering = false;
  pageNumPending: number | undefined;
  pages = [];
  
  @state() isInitialised = false;
  @state() position = { x: 0, y: 0 };
  @state() positions: Record<string, {x: number, y: number}> = {};
  @state() viewport: PageViewport | undefined;

  readonly minScale = 1.0;
  readonly maxScale = 2.3;

  constructor() {
    super();
    GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
  }
  
  connectedCallback(): void {
    super.connectedCallback()
    this.initialLoad();
  }
  
  renderPage(num: number) {
    console.log(this.fields)
    console.log(this.url)
    this.pageRendering = true;
    // Using promise to fetch the page
    console.log('rendering...');

    if (!this.pdfDoc) {
      return;
    }

    this.pdfDoc.getPage(num).then((page) => {
      this.viewport = page.getViewport({ scale: this.scale, rotation: this.rotation });
      const viewport = this.viewport;
      if (!this.shadowRoot) {
        return;
      }
      this.canvas = this.shadowRoot.getElementById('the-canvas');
      const canvasContext = this.canvas.getContext("2d");
      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;

      // Render PDF page into canvas context
      const renderContext = {
        canvasContext,
        viewport,
      };
      const renderTask = page.render(renderContext);

      // Wait for rendering to finish
      renderTask.promise.then(() => {
        console.log('Page rendered')
        
        this.fields.forEach((field) => {
          this.positions[field] = JSON.parse(JSON.stringify(this.position));
          this.dragField(field)
        });
      });
    });
  };

  dragField(className: string) {
    interact(`.${className}`).draggable({
      listeners: {
        start: (event) => {
          console.log(event.type, event.target)
        },
        move: (event) => {
          this.positions[className].x += event.dx
          this.positions[className].y += event.dy
    
          event.target.style.transform =
            `translate(${this.positions[className].x}px, ${this.positions[className].y}px)`
        },
      }
    })
  }

  queueRenderPage(num: number) {
    if (this.pageRendering) {
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  };

  initialLoad() {
    const loadingTask = getDocument({
      ...(this.url && { url: this.url }),
      ...(this.data && { data: this.data }),
    });

    loadingTask.promise
      .then(async (pdfDoc_: PDFDocumentProxy) => {
        this.pdfDoc = pdfDoc_;
        this.isInitialised = true;
        // trigger update
        this.queueRenderPage(this.pageNum);
      })
  };

  getCoordinates(pos: {x: number, y: number}) {
    console.log(pos)
    if (this.viewport && this.viewport?.viewBox?.length > 0) {
      const [x, y, width, height] = this.viewport?.viewBox;
      pos.y = (height - ((pos.y * height) / this.viewport?.height)) - 10;
      pos.x = (pos.x * width) / this.viewport?.width;
    }
    return pos
  }

  async modifyPdf() {
    const url = this.url;
    const existingPdfBytes = await fetch(url).then(res => res.arrayBuffer());
  
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize()
    
    for (const field of this.fields) {
      const pos = this.getCoordinates(JSON.parse(JSON.stringify(this.positions[field])));
      firstPage.drawText('This text was added with JavaScript!', {
        x: pos.x,
        y: pos.y,
        size: 11,
        font: helveticaFont,
        color: rgb(0.95, 0.1, 0.1),
        // rotate: degrees(-45),
      })
    }
  
    const pdfBytes = await pdfDoc.saveAsBase64()
    return pdfBytes;
  }

  private async _display(e: Event) {
    const data = await this.modifyPdf();
    const blob = new Blob([data]);
    const options = {
      detail: {data, blob},
      bubbles: true,
      composed: true
    };
    this.dispatchEvent(new CustomEvent('modified', options));
  }

  private async _download(e: Event) {
    const data = await this.modifyPdf();
    const blob = new Blob([data]);

    if (this.shadowRoot) {
      const a = document.createElement('a');
      this.shadowRoot.append(a);
      a.download = 'abc.pdf';
      a.href = URL.createObjectURL(blob);
      a.click();
      a.remove();
    }
  }

  private _generateConfig(e: Event) {
    const nodes = []
    for (const field of this.fields) {
      const pos = this.getCoordinates(JSON.parse(JSON.stringify(this.positions[field])));
      nodes.push({
        key: field,
        type: 'text',
        fontSize: 9,
        position: pos
      })
    }
    // console.log(nodes)
    const options = {
      detail: {nodes},
      bubbles: true,
      composed: true
    };
    this.dispatchEvent(new CustomEvent('pdfConfig', options));
  }

  _dragBoxContextMenu(e: PointerEvent) {
    e.preventDefault();
    console.log(e);
    if (!this.shadowRoot) return;
    const menu = this.shadowRoot.querySelector<HTMLElement>('.context-menu');
    if (!menu) return;

    menu.style['display'] = "block";
    menu.style['position'] = "absolute";
    
    const menuPosition = this.getPosition(e);
    menu.style['top'] = menuPosition.y + "px";
    menu.style['left'] = menuPosition.x + "px";
    this.requestUpdate();
    
  }

  getPosition(e: PointerEvent) {
    let posX = 0;
    let posY = 0;
    if (!e) e = window.event;
    if (e.pageX || e.pageY) {
      posX = e.pageX;
      posY = e.pageY;
    } else if (e.clientX || e.clientY) {
      posX = e.clientX + document.body.scrollLeft + 
        document.documentElement.scrollLeft;
      posY = e.clientY + document.body.scrollTop +
        document.documentElement.scrollTop;
    }
    return {
      x: posX,
      y: posY
    }
  }

  // Render the UI as a function of component state
  render() {
    return html`
      <div class="context-menu">
        <ul>
          <li>Task1</li>
        </ul>
      </div>

      ${
        this.fields.map((field) => html`
          <div class="draggable ${field}" @contextmenu=${this._dragBoxContextMenu}></div>
        `)
      }
      <canvas id="the-canvas"></canvas>
      <button @click="${this._download}">Download</button>
      <button @click="${this._display}">Display</button>
      <button @click="${this._generateConfig}">Generate Config</button>

    `;
  }
}