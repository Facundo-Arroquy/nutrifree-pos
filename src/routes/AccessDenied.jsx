/** Pantalla mostrada cuando el rol del usuario no habilita la sección. */
export default function AccessDenied() {
  return (
    <div className="page">
      <div className="empty">
        <div className="empty-icon" style={{ opacity:1 }}>🔒</div>
        <h3>Acceso denegado</h3>
        <p>No tenés permiso para ver esta sección.</p>
      </div>
    </div>
  );
}
