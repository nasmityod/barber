/**
 * Marca 787 Barber Studio.
 *
 * Un único punto de verdad para el logo: si mañana cambia el asset, cambia
 * aquí y en ningún otro sitio. El tamaño lo decide siempre el CSS del
 * contenedor; los atributos width/height llevan la proporción real del
 * archivo para que el navegador reserve el espacio y no haya salto de layout.
 *
 * Jerarquía de uso (ver docs/787-VISUAL-IDENTITY.md):
 *   <BrandLogo/>    logo completo. Superficies claras y externas.
 *   <BrandMark/>    sólo la máquina 787. Funciona sobre tinta y sobre papel.
 *   <BrandLockup/>  marca + lockup tipográfico para cabeceras compactas.
 */

const LOGO = { src: "/brand/787-logo.png", width: 480, height: 323 };
const MARK = { src: "/brand/787-mark.png", width: 384, height: 234 };

export const BRAND_NAME = "787 Barber Studio";

export function BrandLogo({ className = "", alt = BRAND_NAME }: { className?: string; alt?: string }) {
  return (
    <img className={`brand-logo ${className}`.trim()} src={LOGO.src} alt={alt} width={LOGO.width} height={LOGO.height} />
  );
}

export function BrandMark({ className = "", alt = "" }: { className?: string; alt?: string }) {
  return (
    <img className={`brand-mark ${className}`.trim()} src={MARK.src} alt={alt} aria-hidden={alt ? undefined : true} width={MARK.width} height={MARK.height} />
  );
}

/**
 * Marca compacta: la máquina 787 hace de símbolo y el texto completa el
 * lockup. El "787" no se repite en tipografía: ya está en la máquina.
 */
export function BrandLockup({ className = "", caption = "Barber Studio" }: { className?: string; caption?: string }) {
  return (
    <div className={`login-brand ${className}`.trim()}>
      <BrandMark alt={BRAND_NAME} />
      <span className="brand-word"><strong>Barber Studio</strong><small>{caption}</small></span>
    </div>
  );
}
