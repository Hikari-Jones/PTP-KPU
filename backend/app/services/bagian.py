from app.models.schema import Bagian
from app.schemas.bagian import BagianCreate, BagianUpdate
from app.services.base import CRUDBase

class CRUDBagian(CRUDBase[Bagian, BagianCreate, BagianUpdate]):
    pass

bagian = CRUDBagian(Bagian)
