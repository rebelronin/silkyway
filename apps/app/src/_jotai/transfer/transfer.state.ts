import { atom } from 'jotai';
import type { TransferInfo } from '@silkysquad/silk/dist/transfers.js';

export const transfersAtom = atom<TransferInfo[]>([]);

export const isLoadingTransfersAtom = atom<boolean>(false);
