// Catálogo editable de ChaMuYa2. Las rondas y votaciones permanecen en app/Firebase.
export function createChamuyayaGame({ chamuyayaData }) {
  const catalog = Array.isArray(chamuyayaData) ? chamuyayaData : [];
  function chamuyayaDataById(id) {
    return catalog.find(item => Number(item.id) === Number(id)) || null;
  }
  return { chamuyayaDataById, chamuyayaCatalog: catalog };
}
