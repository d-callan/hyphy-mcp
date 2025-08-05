"""
Shared Python schemas for HyPhy MCP
"""

from typing import Dict, Any, Optional, Literal


class HyphyMethod:
    """Schema for HyPhy analysis methods"""
    
    def __init__(self, name: str, full_name: str, description: str):
        self.name = name
        self.full_name = full_name
        self.description = description
    
    def to_dict(self) -> Dict[str, str]:
        return {
            "name": self.name,
            "full_name": self.full_name,
            "description": self.description
        }


class FileUploadResult:
    """Schema for file upload results"""
    
    def __init__(
        self, 
        status: Literal["success", "error"],
        file_handle: Optional[str] = None,
        file_name: Optional[str] = None,
        file_size: Optional[int] = None,
        error: Optional[str] = None
    ):
        self.status = status
        self.file_handle = file_handle
        self.file_name = file_name
        self.file_size = file_size
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        result = {"status": self.status}
        if self.file_handle:
            result["file_handle"] = self.file_handle
        if self.file_name:
            result["file_name"] = self.file_name
        if self.file_size:
            result["file_size"] = self.file_size
        if self.error:
            result["error"] = self.error
        return result


class JobResult:
    """Schema for job results"""
    
    def __init__(
        self,
        status: Literal["success", "error", "running"],
        job_id: Optional[str] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
        input_data: Optional[Dict[str, Any]] = None,
        results: Optional[Dict[str, Any]] = None
    ):
        self.status = status
        self.job_id = job_id
        self.message = message
        self.error = error
        self.input_data = input_data or {}
        self.results = results
    
    def to_dict(self) -> Dict[str, Any]:
        result = {"status": self.status}
        if self.job_id:
            result["job_id"] = self.job_id
        if self.message:
            result["message"] = self.message
        if self.error:
            result["error"] = self.error
        if self.input_data:
            result["input"] = self.input_data
        if self.results:
            result["results"] = self.results
        return result


class ApiStatus:
    """Schema for API status"""
    
    def __init__(
        self,
        status: Literal["connected", "error"],
        url: Optional[str] = None,
        version: Optional[str] = None,
        error: Optional[str] = None
    ):
        self.status = status
        self.url = url
        self.version = version
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        result = {"status": self.status}
        if self.url:
            result["url"] = self.url
        if self.version:
            result["version"] = self.version
        if self.error:
            result["error"] = self.error
        return result
