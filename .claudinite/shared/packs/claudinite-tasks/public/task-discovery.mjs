// Where a task's declaration lives on disk and how it is read, published for the packs
// whose own worker needs its task's declared fields at run time — a timeout, a model, a
// cadence it must honor — rather than re-reading `task.json` with a path it spelled
// itself.
//
// SEPARATE from `task-declaration.mjs`, which publishes the same declaration as TEXT and
// promises to reach no Node built-in so a browser bundle can load it. These two read the
// filesystem, so publishing them beside the parser would quietly break that promise for
// every page that imports it.
export {
  findTaskDeclaration, loadTaskDeclaration,
} from '../src/contract/task-declaration.mjs';
