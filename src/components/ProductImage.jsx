import { useState } from "react";
import { productImage, productInitials } from "../utils/productImages.js";

export default function ProductImage({ product }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : productImage(product);

  return (
    <div className={`product-card-media${src ? "" : " product-card-media--fallback"}`}>
      {src ? (
        <img
          src={src}
          alt={product.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{productInitials(product.name)}</span>
      )}
    </div>
  );
}
