import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { PDFDocumentProxy, GlobalWorkerOptions, getDocument, PageViewport } from "pdfjs-dist";


@customElement('pdf-viewer')
export class PdfViewer extends LitElement {
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

  #pdf-viewer-canvas {
    border: 1px solid black;
  }
  `

  @property() data: any;
  @property() url: string = '';

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
      this.canvas = this.shadowRoot.getElementById('pdf-viewer-canvas');
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
      });
    });
  };

  queueRenderPage(num: number) {
    if (this.pageRendering) {
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  };

  initialLoad() {
    const loadingTask = getDocument({data: atob(this.data)});

    loadingTask.promise
      .then(async (pdfDoc_: PDFDocumentProxy) => {
        this.pdfDoc = pdfDoc_;
        this.isInitialised = true;
        // trigger update
        this.queueRenderPage(this.pageNum);
      })
  };

  // Render the UI as a function of component state
  render() {
    return html`
      <canvas id="pdf-viewer-canvas"></canvas>
    `;
  }
}