import { Request, Response } from 'express';
import { z } from 'zod';
import { Product } from '../models/Product';
import { ApiError } from '../utils/ApiError';
import { wrap } from '../utils/asyncWrapper';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.string().min(1),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'poor']),
});

const updateSchema = createSchema.partial();

const createProduct = wrap(async (req: Request, res: Response) => {
  const data = createSchema.parse(req.body);
  const photos = (req.files as Express.Multer.File[])?.map(f => f.path) ?? [];

  const product = await Product.create({
    ...data,
    photos,
    seller: req.user!._id,
  });
  res.status(201).json(product);
});

const getProducts = wrap(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.status)   filter.status   = req.query.status;

  const products = await Product.find(filter).populate('seller', 'email');
  res.json(products);
});

const getProduct = wrap(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id).populate('seller', 'email');
  if (!product) throw new ApiError(404, 'Produit introuvable');
  res.json(product);
});

const updateProduct = wrap(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Produit introuvable');
  if (product.seller.toString() !== req.user!._id.toString())
    throw new ApiError(403, 'Non autorisé');
  if (product.status === 'in_auction')
    throw new ApiError(400, 'Impossible de modifier un produit en cours d\'enchère');

  const data = updateSchema.parse(req.body);
  const updated = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
  res.json(updated);
});

const deleteProduct = wrap(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Produit introuvable');
  if (product.seller.toString() !== req.user!._id.toString())
    throw new ApiError(403, 'Non autorisé');
  if (product.status !== 'draft')
    throw new ApiError(400, 'Seuls les produits en brouillon peuvent être supprimés');

  await product.deleteOne();
  res.json({ message: 'Produit supprimé' });
});

export const productController = { createProduct, getProducts, getProduct, updateProduct, deleteProduct };
