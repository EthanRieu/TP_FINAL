import { Auction }           from '../models/Auction';
import { Product }           from '../models/Product';
import { commissionService } from './commission.service';
import { getIO }             from '../socket';
import { EVENTS }            from '../socket/events';

export const auctionService = {

  async lazyClose(auctionId: string) {
    const auction = await Auction.findById(auctionId).select('+reservePrice');
    if (!auction || auction.status !== 'active') return null;
    if (auction.endAt > new Date()) return null;
    return auctionService.close(auction as any);
  },

  async close(auction: any) {
    // vérifie si le prix de réserve est atteint (ou absent)
    const hasWinner =
      !!auction.currentWinner &&
      (!auction.reservePrice || auction.currentPrice >= auction.reservePrice);

    // calcule la commission seulement s'il y a un gagnant
    const finalPrice = hasWinner ? auction.currentPrice : undefined;
    const commission = hasWinner ? commissionService.calculate(auction.currentPrice) : undefined;

    // met à jour l'enchère et le produit en base
    const closed = await Auction.findByIdAndUpdate(
      auction._id,
      {
        status:     hasWinner ? 'settled' : 'closed',
        winner:     hasWinner ? auction.currentWinner : undefined,
        reserveMet: hasWinner,
        finalPrice,
        commission,
      },
      { new: true }
    );

    await Product.findByIdAndUpdate(auction.product, {
      status: hasWinner ? 'sold' : 'draft',
    });

    // notifie la clôture à tous les watchers
    getIO().to(auction._id.toString()).emit(EVENTS.AUCTION_CLOSED, {
      auctionId:  auction._id,
      winner:     hasWinner ? auction.currentWinner : null,
      finalPrice: finalPrice ?? null,
      commission: commission ?? null,
      reserveMet: hasWinner,
    });

    return closed;
  },

  scheduleClose(auctionId: string, endAt: Date) {
    const delay = endAt.getTime() - Date.now();
    if (delay <= 0) {
      Auction.findById(auctionId)
        .select('+reservePrice')
        .then((a) => a && auctionService.close(a));
      return;
    }
    setTimeout(async () => {
      const a = await Auction.findById(auctionId).select('+reservePrice');
      if (a) auctionService.close(a);
    }, delay);
  },
};
