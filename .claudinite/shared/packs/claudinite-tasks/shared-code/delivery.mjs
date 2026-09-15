// The delivery lane, published for other packs: how a task's output becomes a landed
// pull request or a regenerated file, honoring the repo's delivery settings.
export {
  deliveryFor, landDelivery, openDeliveredPull, disposeOpenPull, pullCreateError,
} from '../src/deliver/land-pr.mjs';
export {
  deliverGenerated, baseTip, readAt, remoteUrl,
} from '../src/deliver/deliver-generated.mjs';
export {
  withTaskTrailer,
} from '../src/contract/task-trailer.mjs';
