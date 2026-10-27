import os
from uuid import uuid4

import pytest
from pymongo.errors import PyMongoError

from app import create_app
from app.config import settings
from app.db import bootstrap, connect
from app.services.payments import create_account


@pytest.fixture
def db():
    name = "ledgerlite_test_" + uuid4().hex[:12]
    database = connect(settings({"MONGODB_URI": os.getenv("TEST_MONGODB_URI", "mongodb://localhost:27017/?replicaSet=rs0"), "MONGODB_DB": name}))
    try:
        database.client.admin.command("ping")
    except PyMongoError:
        pytest.skip("Real MongoDB replica set unavailable; set TEST_MONGODB_URI. No transaction guarantee has been tested.")
    bootstrap(database)
    yield database
    assert database.name.startswith("ledgerlite_test_")
    database.client.drop_database(database.name)
    database.client.close()


@pytest.fixture
def funded(db):
    for handle, balance in (("asha@upi", 100000), ("rahul@upi", 50000)):
        create_account(db, {"handle": handle, "display_name": handle.split("@")[0].title(), "opening_balance": balance})
    return db


@pytest.fixture
def client(funded, tmp_path):
    return create_app({"TESTING": True, "REPORT_DIR": str(tmp_path), "DEMO_MODE": True}, database=funded).test_client()
