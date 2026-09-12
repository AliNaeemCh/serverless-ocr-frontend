# Serverless OCR — Frontend

A lightweight React client for the serverless OCR application.

The frontend provides document upload, real-time processing progress, and HTML rendering with LaTeX support while the backend handles document processing and Gemini-based extraction.

## How It Works

The client uses HTTP and WebSocket connections for different parts of the workflow:

```text
┌──────────────────────┐
│      React UI        │
└──────────┬───────────┘
           │
           ├──── WebSocket ────► API Gateway
           │                         │
           │                         ▼
           │                    getConnId
           │                         │
           │◄──── connection ID ────┘
           │
           ├──── HTTP POST ─────► API Gateway
           │                         │
           │                    POST /start
           │                         │
           │                         ▼
           │                       Lambda
           │                         │
           │◄──── progress ─────────┤
           │      WebSocket          │
           │                         │
           │◄──── HTML ─────────────┘
           │      HTTP response
           ▼
      Render result
```

The workflow is:

1. Open a WebSocket connection.
2. Request the connection ID through `getConnId`.
3. Upload the document to `POST /start` together with the connection ID.
4. Receive page-level progress updates through the WebSocket.
5. Receive the final HTML from the HTTP response.
6. Render the extracted HTML and LaTeX in the UI.

## Configuration

The frontend uses Vite environment files.

### Development

Create `.env`:

```text
VITE_HTTP_API_URL=https://<http-api-id>.execute-api.<region>.amazonaws.com

VITE_WEBSOCKET_URL=wss://<websocket-api-id>.execute-api.<region>.amazonaws.com/<stage>
```

### Production

Create `.env.production` with the production API endpoints:

```text
VITE_HTTP_API_URL=https://<http-api-id>.execute-api.<region>.amazonaws.com

VITE_WEBSOCKET_URL=wss://<websocket-api-id>.execute-api.<region>.amazonaws.com/<stage>
```

Vite automatically uses `.env.production` when creating a production build.

## Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The application will be available at the local development URL printed by Vite.

## Production Build

Build the production bundle:

```bash
npm run build
```

The generated static assets can be served from any static hosting platform such as Amazon S3 with CloudFront.

## Backend

This frontend requires the corresponding serverless backend to be deployed first.

See the [backend repository](https://github.com/AliNaeemCh/serverless-ocr) for the Lambda implementation, API Gateway configuration, deployment instructions, and backend integration details.
