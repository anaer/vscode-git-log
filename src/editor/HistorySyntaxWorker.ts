import { parentPort } from 'node:worker_threads';
import {
  enforceHistorySyntaxTokenBudget,
  isHistorySyntaxTokenizeRequest,
  type HistorySyntaxWorkerResponse,
} from './HistorySyntaxWorkerProtocol';
import { ShikiHistoryWorkerTokenizer } from './ShikiHistoryWorkerTokenizer';

const port = parentPort;
if (!port) throw new Error('History syntax worker requires a parent port.');

const tokenizer = new ShikiHistoryWorkerTokenizer();

port.on('message', async (value: unknown) => {
  if (!isHistorySyntaxTokenizeRequest(value)) return;
  let response: HistorySyntaxWorkerResponse;
  try {
    const lines = await tokenizer.tokenize(value.code, value.path);
    enforceHistorySyntaxTokenBudget(lines);
    response = {
      id: value.id,
      type: 'tokenized',
      lines,
    };
  } catch (error) {
    response = {
      id: value.id,
      type: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    port.postMessage(response);
  } catch (error) {
    // The parent may have torn down mid-tokenization; a failed send must not
    // crash the worker thread (the parent treats this as a worker failure).
    process.emitWarning(
      `[git-log] history worker could not post tokenize response: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
});

port.on('close', () => tokenizer.dispose());
