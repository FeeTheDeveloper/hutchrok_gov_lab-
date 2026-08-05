import { requestHandler } from '../src/server.js';

// Vercel Node Function entry point. The generation endpoint is stateless: all
// generated artifacts are returned in the response rather than written to disk.
export default requestHandler;
