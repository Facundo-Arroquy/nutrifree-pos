const PHOTO_ROOT = "/imagenes/Fotos%20Foto%20Producto%20Con%20Ia";

const PRODUCT_PHOTOS = [
  { matches: ["6 mini alfajores", "mini alfajor"], file: "AlfMini.jpeg" },
  { matches: ["alfajor maicena"], file: "AlfMaicena.jpeg" },
  { matches: ["brownie"], file: "Brownie.jpg" },
  { matches: ["budin x 300", "budin banana y choco 300"], file: "Budin%20300grs.JPG" },
  { matches: ["cheesecake"], file: "Chessecake.jpg" },
  { matches: ["cookies", "cookie"], file: "Cookies.jpeg" },
  { matches: ["cuadrado de coco"], file: "Cuadrado%20de%20Coco.jpg" },
  { matches: ["muffins limon", "muffin limon"], file: "Muffin%20limon.JPG" },
  { matches: ["muffins naranja", "muffin naranja"], file: "Muffin%20naranja.JPG" },
  { matches: ["pack viandas x 3", "pack x 3 viandas"], file: "Pack%20Viandasx3.JPG" },
  { matches: ["pan x 1 kg", "pan integral 1 kg"], file: "Pan%201kg.JPG" },
  { matches: ["pastafrola"], file: "Pastafrola.jpg" },
  { matches: ["pizza muzzarela individual", "pizza individual"], file: "Pizza%20Individual.JPG" },
  { matches: ["tarta porcion", "porcion de tarta"], file: "Porcion%20de%20tarta.JPG" },
  { matches: ["scons"], file: "Scons.png" },
  { matches: ["chipa"], file: "chipaNuevo.JPG" },
  { matches: ["pan dulce"], file: "pan%20Dulce.JPG" },
];

export function normalizeProductName(value = "") {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function productImage(product) {
  if (product?.photo) return product.photo;

  const name = normalizeProductName(product?.name);
  const photo = PRODUCT_PHOTOS.find(({ matches }) =>
    matches.some(match => name.includes(normalizeProductName(match)))
  );

  return photo ? `${PHOTO_ROOT}/${photo.file}` : null;
}

export function productInitials(name = "") {
  const words = normalizeProductName(name).split(" ").filter(Boolean);
  if (words.length === 0) return "NF";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
