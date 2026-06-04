import { Auction }         from '../models/Auction';
import { Bid }             from '../models/Bid';
import { ApiError }        from '../utils/ApiError';
import { getIO }           from '../socket';
import { EVENTS }          from '../socket/events';
const SNIPE_WINDOW_MS    = 30_000;
const SNIPE_EXTENSION_MS = 60_000;

export const bidService = {
  async placeBid(
    auctionId: string,
    bidderId: string,
    amount: number,
    confirmed = false,
  ) {
    // vérifie que l'enchère est active
    const current = await Auction.findById(auctionId);
    if (!current || current.status !== 'active') {
      throw new ApiError(400, 'Enchère non disponible');
    }

    // bloque le vendeur sur sa propre enchère
    if (current.seller.toString() === bidderId) {
      throw new ApiError(403, 'Vous ne pouvez pas miser sur votre propre enchère');
    }

    // anti-fraude : mise > 10x sans confirmation explicite
    if (amount > current.currentPrice * 10 && !confirmed) {
      throw new ApiError(400, 'Mise supérieure à 10× le prix courant. Confirmation requise.', {
        requireConfirmation: true,
        currentPrice: current.currentPrice,
      });
    }

    // mise atomique — résout la race condition entre deux bids simultanés
    const updated = await Auction.findOneAndUpdate(
      {
        _id: auctionId,
        status: 'active',
        currentPrice: { $lt: amount },
        seller: { $ne: bidderId },
      },
      { $set: { currentPrice: amount, currentWinner: bidderId } },
      { new: true }
    );

    if (!updated) {
      throw new ApiError(409, 'Mise refusée : montant insuffisant ou enchère indisponible');
    }

    // anti-sniping : prolonge l'enchère si moins de 30s restantes
    const timeLeft = updated.endAt.getTime() - Date.now();
    if (timeLeft < SNIPE_WINDOW_MS) {
      const newEndAt = new Date(updated.endAt.getTime() + SNIPE_EXTENSION_MS);
      await Auction.findByIdAndUpdate(auctionId, {
        $inc: { extensionCount: 1 },
        $set: { endAt: newEndAt },
      });
      getIO().to(auctionId).emit(EVENTS.AUCTION_EXTENDED, {
        auctionId,
        newEndAt,
        extensionCount: updated.extensionCount + 1,
      });
    }

    // sauvegarde le bid en base
    const bid = await Bid.create({
      auction:           auctionId,
      bidder:            bidderId,
      amount,
      isAuto: false,
      confirmedOverride: confirmed,
    });

    // notifie les watchers via socket
    getIO().to(auctionId).emit(EVENTS.BID_PLACED, {
      auctionId,
      amount,
      currentPrice: amount,
      bidderId,
    });

    return bid;
  },
};
