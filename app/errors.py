class APIError(Exception):
    def __init__(self, code, message, status=400, details=None):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
        self.details = details or {}

    def body(self):
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}


class OutcomeUnknown(Exception):
    """A commit acknowledgment was lost. Never convert this into a rollback."""


class OwnershipLost(Exception):
    pass
