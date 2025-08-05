# HyPhy MCP Server
import json
import logging
import os
import requests
import tempfile
import threading
import time
import uuid
from typing import Any, Dict, Optional

from mcp.server.fastmcp import FastMCP

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create an MCP server with extended timeout (20 minutes)
mcp = FastMCP("HyPhy", dependencies=["biopython", "requests"], timeout=1200)

# Datamonkey API state
datamonkey_state: Dict[str, Any] = {
    "api_url": os.environ.get("DATAMONKEY_API_URL", "http://localhost"),
    "api_port": int(os.environ.get("DATAMONKEY_API_PORT", "9300")),
    "temp_dir": None,
    "last_results": {},
    "jobs": {},  # Store background jobs
}

# Get the full API URL including port
def get_api_url() -> str:
    """Get the full Datamonkey API URL including port"""
    return f"{datamonkey_state['api_url']}:{datamonkey_state['api_port']}/api/v1"


def ensure_datamonkey_api_connection():
    """Helper function to ensure Datamonkey API is accessible"""
    try:
        response = requests.get(f"{get_api_url()}/health")
        response.raise_for_status()
        return True
    except requests.RequestException as e:
        raise ConnectionError(
            f"Could not connect to Datamonkey API at {get_api_url()}. "
            f"Error: {str(e)}. "
            f"Please ensure the API is running and the URL/port are correct."
        )


@mcp.tool()
def upload_file_to_datamonkey(file_path: str) -> Dict[str, Any]:
    """Upload a file to the Datamonkey API and return the file handle
    
    Args:
        file_path: Path to the file to upload
        
    Returns:
        Dictionary containing the file handle and status information
    """
    try:
        ensure_datamonkey_api_connection()
        
        if not os.path.exists(file_path):
            return {
                "status": "error",
                "error": f"File not found: {file_path}"
            }
        
        # Read the file content
        with open(file_path, "rb") as f:
            file_content = f.read()
        
        # Upload the file to the Datamonkey API
        logger.info(f"Uploading file {file_path} to Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/datasets",
            files={"file": (os.path.basename(file_path), file_content)}
        )
        response.raise_for_status()
        
        # Extract the file handle from the response
        response_data = response.json()
        if "id" not in response_data:
            return {
                "status": "error",
                "error": f"Invalid response from Datamonkey API: {response_data}"
            }
        
        file_handle = response_data["id"]
        logger.info(f"File uploaded successfully, handle: {file_handle}")
        
        return {
            "status": "success",
            "file_handle": file_handle,
            "file_name": os.path.basename(file_path),
            "file_size": os.path.getsize(file_path)
        }
    except Exception as e:
        logger.error(f"Error uploading file to Datamonkey API: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


def run_hyphy_method_sync(method: str, alignment_file: str, tree_file: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """Run a HyPhy analysis method synchronously via the Datamonkey API
    
    Args:
        method: HyPhy method to run (BUSTED, FEL, MEME, etc.)
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional for some methods)
        **kwargs: Additional method-specific parameters
        
    Returns:
        Dictionary containing analysis results and metadata
    """
    ensure_datamonkey_api_connection()
    
    # Upload the alignment and tree files to get their handles
    alignment_handle = upload_file_to_datamonkey(alignment_file)
    tree_handle = upload_file_to_datamonkey(tree_file) if tree_file else None
    
    # Prepare the request payload based on the method
    payload = {
        "alignment": alignment_handle,
    }
    
    if tree_handle:
        payload["tree"] = tree_handle
    
    # Add method-specific parameters
    if method == "BUSTED":
        if kwargs.get("branches"):
            payload["branches"] = kwargs["branches"]
    
    elif method in ["FEL", "MEME"]:
        if kwargs.get("pvalue"):
            payload["pvalue"] = kwargs["pvalue"]
    
    # Start the job
    logger.info(f"Starting {method} job with Datamonkey API")
    try:
        response = requests.post(
            f"{get_api_url()}/methods/{method.lower()}-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if 'job_id' not in job_data:
            raise ValueError(f"Invalid response from Datamonkey API: {job_data}")
            
        job_id = job_data['job_id']
        
        # Poll for job completion
        max_attempts = 60  # Maximum number of polling attempts
        poll_interval = 10  # Seconds between polling attempts
        
        for attempt in range(max_attempts):
            logger.info(f"Polling job status (attempt {attempt+1}/{max_attempts})")
            
            # Check job status
            status_response = requests.get(
                f"{get_api_url()}/methods/{method.lower()}-result",
                params={"job_id": job_id}
            )
            status_response.raise_for_status()
            status_data = status_response.json()
            
            if status_data.get('status') == 'completed':
                # Job completed successfully
                logger.info(f"{method} job completed successfully")
                
                # Store the results for later reference
                datamonkey_state["last_results"][method] = status_data
                
                # Save results to a file for compatibility with existing code
                output_file = os.path.join(datamonkey_state["temp_dir"], f"{method}_{job_id}.json")
                with open(output_file, 'w') as f:
                    json.dump(status_data, f)
                
                return {
                    "status": "success",
                    "method": method,
                    "results": status_data,
                    "output_file": output_file,
                    "job_id": job_id
                }
            
            elif status_data.get('status') == 'error':
                # Job failed
                error_message = status_data.get('error_message', 'Unknown error')
                logger.error(f"{method} job failed: {error_message}")
                raise RuntimeError(f"Datamonkey {method} analysis failed: {error_message}")
            
            # Job still running, wait and try again
            time.sleep(poll_interval)
        
        # If we get here, the job timed out
        raise TimeoutError(f"Datamonkey {method} analysis timed out after {max_attempts * poll_interval} seconds")
        
    except Exception as e:
        logger.error(f"Error running {method} job with Datamonkey API: {e}")
        raise RuntimeError(f"Failed to run {method} job with Datamonkey API: {str(e)}")


def run_hyphy_method_async(method: str, alignment_file: str, tree_file: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """Run a HyPhy analysis method asynchronously via the Datamonkey API
    
    Args:
        method: HyPhy method to run (BUSTED, FEL, MEME, etc.)
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional for some methods)
        **kwargs: Additional method-specific parameters
        
    Returns:
        Dictionary containing job ID and status information
    """
    ensure_datamonkey_api_connection()
    
    # Create a temporary directory for output files if not already created
    if datamonkey_state["temp_dir"] is None:
        datamonkey_state["temp_dir"] = tempfile.mkdtemp(prefix="datamonkey_mcp_")
    
    # Generate a unique internal job ID to track this request
    internal_job_id = str(uuid.uuid4())
    
    # Store job information
    datamonkey_state["jobs"][internal_job_id] = {
        "method": method,
        "alignment_file": alignment_file,
        "tree_file": tree_file,
        "kwargs": kwargs,
        "status": "queued",
        "start_time": time.time(),
        "results": None,
        "error": None,
        "datamonkey_job_id": None,  # Will be set by the worker
        "output_file": None  # Will be set by the worker
    }
    
    # Start a worker thread to handle the API interaction
    worker_thread = threading.Thread(
        target=run_hyphy_method_async_worker,
        args=(internal_job_id, method, alignment_file, tree_file, kwargs),
        daemon=True
    )
    worker_thread.start()
    
    # Return the job information
    return {
        "status": "accepted",
        "job_id": internal_job_id,
        "message": f"Datamonkey {method} analysis started in the background. Use check_job_status to monitor progress."
    }


def run_hyphy_method_async_worker(job_id: str, method: str, alignment_file: str, tree_file: Optional[str], kwargs: Dict[str, Any]) -> None:
    """Worker function to run a HyPhy analysis via the Datamonkey API in the background"""
    try:
        # Update job status
        datamonkey_state["jobs"][job_id]["status"] = "running"
        
        # Upload the alignment and tree files to get their handles
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        tree_handle = upload_file_to_datamonkey(tree_file) if tree_file else None
        
        # Prepare the request payload based on the method
        payload = {
            "alignment": alignment_handle,
        }
        
        if tree_handle:
            payload["tree"] = tree_handle
        
        # Add method-specific parameters
        if method == "BUSTED":
            if kwargs.get("branches"):
                payload["branches"] = kwargs["branches"]
        
        elif method in ["FEL", "MEME"]:
            if kwargs.get("pvalue"):
                payload["pvalue"] = kwargs["pvalue"]
        
        # Start the job
        logger.info(f"Starting {method} job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/{method.lower()}-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if 'job_id' not in job_data:
            raise ValueError(f"Invalid response from Datamonkey API: {job_data}")
            
        datamonkey_job_id = job_data['job_id']
        
        # Store the Datamonkey job ID
        datamonkey_state["jobs"][job_id]["datamonkey_job_id"] = datamonkey_job_id
        
        # Create a placeholder for the output file
        output_file = os.path.join(datamonkey_state["temp_dir"], f"{method}_{datamonkey_job_id}.json")
        datamonkey_state["jobs"][job_id]["output_file"] = output_file
        
        logger.info(f"Datamonkey {method} job started with ID {datamonkey_job_id}")
        
    except Exception as e:
        logger.error(f"Error starting Datamonkey job: {e}")
        datamonkey_state["jobs"][job_id]["status"] = "error"
        datamonkey_state["jobs"][job_id]["error"] = str(e)


def run_hyphy_method(method: str, alignment_file: str, tree_file: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """Run a HyPhy analysis method on the provided alignment and tree files via the Datamonkey API
    
    All HyPhy methods run asynchronously in the background to avoid timeout issues.
    
    Args:
        method: HyPhy method to run (BUSTED, FEL, MEME, etc.)
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional for some methods)
        **kwargs: Additional method-specific parameters
        
    Returns:
        Dictionary containing job information
    """
    # Always run asynchronously to avoid timeout issues
    return run_hyphy_method_async(method, alignment_file, tree_file, **kwargs)


@mcp.tool()
def check_datamonkey_api() -> Dict[str, Any]:
    """Check if the Datamonkey API is accessible
    
    Returns:
        Information about the Datamonkey API connection
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Get API health status
        response = requests.get(f"{get_api_url()}/health")
        response.raise_for_status()
        health_data = response.json()
        
        return {
            "connected": True,
            "url": get_api_url(),
            "status": health_data.get("status", "OK"),
            "version": health_data.get("version", "Unknown")
        }
    except Exception as e:
        return {
            "connected": False,
            "url": get_api_url(),
            "error": str(e)
        }


@mcp.tool()
def start_busted_job(alignment_file: str, tree_file: Optional[str] = None, branches: Optional[str] = None) -> Dict[str, Any]:
    """Start a BUSTED (Branch-Site Unrestricted Statistical Test for Episodic Diversification) job on the Datamonkey API
    
    BUSTED tests for evidence of episodic positive selection on a subset of branches in the phylogeny.
    
    Args:
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional)
        branches: Branches to test for selection (optional, comma-separated list)
        
    Returns:
        Dictionary containing the job ID and status information
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_upload_result = upload_file_to_datamonkey(alignment_file)
        if alignment_upload_result["status"] != "success":
            return alignment_upload_result  # Return the error
        
        alignment_handle = alignment_upload_result["file_handle"]
        
        # Upload the tree file if provided
        tree_handle = None
        if tree_file:
            tree_upload_result = upload_file_to_datamonkey(tree_file)
            if tree_upload_result["status"] != "success":
                return tree_upload_result  # Return the error
            
            tree_handle = tree_upload_result["file_handle"]
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle
        }
        
        if tree_handle:
            payload["tree"] = tree_handle
            
        if branches:
            payload["branches"] = branches
        
        # Start the BUSTED job
        logger.info("Starting BUSTED job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/busted-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": f"Invalid response from Datamonkey API: {job_data}"
            }
            
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "BUSTED analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "branches": branches
            }
        }
    except Exception as e:
        logger.error(f"Error starting BUSTED job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def run_fel(alignment_file: str, tree_file: Optional[str] = None, pvalue: float = 0.1) -> Dict[str, Any]:
    """Run FEL (Fixed Effects Likelihood)
    
    FEL is a method to detect sites under selection by estimating nonsynonymous and synonymous substitution rates at each site.
    This is a long-running analysis that may take 5-10 minutes to complete. The analysis will run in the background.
    
    Args:
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional)
        pvalue: P-value threshold for significance (default: 0.1)
        
    Returns:
        Job information for the FEL analysis
    """
    try:
        kwargs = {"pvalue": pvalue}
        job_info = run_hyphy_method("FEL", alignment_file, tree_file, **kwargs)
        
        # If this is a background job, return the job information
        if job_info.get("status") == "accepted":
            return {
                "status": "accepted",
                "job_id": job_info["job_id"],
                "message": "FEL analysis started in the background. Use check_job_status to monitor progress.",
                "input": {
                    "file": alignment_file,
                    "tree": tree_file,
                    "pvalue": pvalue
                }
            }
        
        # If it's not a background job (should not happen for FEL), process as before
        fel_results = job_info["results"]
        
        # Count positively and negatively selected sites
        positive_sites = []
        negative_sites = []
        
        if "MLE" in fel_results:
            for site, data in fel_results["MLE"].items():
                if isinstance(data, dict) and "p-value" in data and "beta" in data and "alpha" in data:
                    if data["p-value"] <= pvalue:
                        if data["beta"] > data["alpha"]:
                            positive_sites.append(int(site))
                        else:
                            negative_sites.append(int(site))
        
        summary = {
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "pvalue": pvalue
            },
            "results": {
                "positive_selection_sites": positive_sites,
                "negative_selection_sites": negative_sites,
                "total_positive_sites": len(positive_sites),
                "total_negative_sites": len(negative_sites)
            },
            "output_file": job_info["output_file"]
        }
        
        return {
            "status": "success",
            "summary": summary,
            "full_results": fel_results
        }
    except Exception as e:
        logger.error(f"Error running FEL: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def run_meme(alignment_file: str, tree_file: Optional[str] = None, pvalue: float = 0.1) -> Dict[str, Any]:
    """Run MEME (Mixed Effects Model of Evolution)
    
    MEME is a method to detect sites under episodic selection by allowing the nonsynonymous rate to vary across lineages at individual sites.
    This is a long-running analysis that may take several minutes to complete. The analysis will run in the background.
    
    Args:
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional)
        pvalue: P-value threshold for significance (default: 0.1)
        
    Returns:
        Job information for the MEME analysis
    """
    try:
        kwargs = {"pvalue": pvalue}
        job_info = run_hyphy_method("MEME", alignment_file, tree_file, **kwargs)
        
        # If this is a background job, return the job information
        if job_info.get("status") == "accepted":
            return {
                "status": "accepted",
                "job_id": job_info["job_id"],
                "message": "MEME analysis started in the background. Use check_job_status to monitor progress.",
                "input": {
                    "file": alignment_file,
                    "tree": tree_file,
                    "pvalue": pvalue
                }
            }
        
        # If it's not a background job (should not happen for MEME), process as before
        meme_results = job_info["results"]
        
        # Count sites under episodic selection
        selected_sites = []
        
        if "MLE" in meme_results:
            for site, data in meme_results["MLE"].items():
                if isinstance(data, dict) and "p-value" in data:
                    if data["p-value"] <= pvalue:
                        selected_sites.append(int(site))
        
        summary = {
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "pvalue": pvalue
            },
            "results": {
                "episodic_selection_sites": selected_sites,
                "total_sites_under_selection": len(selected_sites)
            },
            "output_file": job_info["output_file"]
        }
        
        return {
            "status": "success",
            "summary": summary,
            "full_results": meme_results
        }
    except Exception as e:
        logger.error(f"Error running MEME: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def check_datamonkey_job_status(job_id: str) -> Dict[str, Any]:
    """Check the status of a job on the Datamonkey API
    
    Args:
        job_id: The ID of the job to check
        
    Returns:
        Information about the job status and results if completed
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Poll the Datamonkey API for job status
        api_response = requests.get(f"{get_api_url()}/jobs/{job_id}")
        api_response.raise_for_status()
        job_status_data = api_response.json()
        
        # Basic response with status information
        response = {
            "status": job_status_data["status"],
            "job_id": job_id
        }
        
        # If the job failed, include the error message
        if job_status_data["status"] == "error":
            response["error"] = job_status_data.get("error_message", "Unknown error")
            return response
        
        # If the job is still running or queued, just return the status
        if job_status_data["status"] in ["queued", "running"]:
            return response
            
        # If the job completed successfully, include the results
        if job_status_data["status"] == "completed":
            # Fetch the results
            results_response = requests.get(f"{get_api_url()}/jobs/{job_id}/results")
            results_response.raise_for_status()
            results = results_response.json()
            
            # Include basic results in the response
            response["results"] = results
            
            # If requested, save results to a file
            if "save_to" in job_status_data:
                output_file = job_status_data["save_to"]
                with open(output_file, "w") as f:
                    json.dump(results, f)
                response["output_file"] = output_file
                
            return response
            
        # Unknown status
        return response
        
    except Exception as e:
        logger.error(f"Error checking job status with Datamonkey API: {e}")
        return {
            "status": "error",
            "error": str(e)
        }
    
    # Shouldn't get here, but just in case
    return response


@mcp.tool()
def start_fel_job(alignment_file: str, tree_file: Optional[str] = None, branches: Optional[str] = None, pvalue: float = 0.1) -> Dict[str, Any]:
    """Start a FEL (Fixed Effects Likelihood) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        tree_file: Optional path to the tree file
        branches: Optional branches to test (comma-separated list or 'All')
        pvalue: P-value threshold for significance (default: 0.1)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file if provided
        tree_handle = None
        if tree_file:
            tree_handle = upload_file_to_datamonkey(tree_file)
            if "error" in tree_handle:
                return tree_handle
        
        # Prepare the payload for the FEL job
        payload = {
            "alignment": alignment_handle["handle"],
            "pvalue": pvalue
        }
        
        if tree_handle:
            payload["tree"] = tree_handle["handle"]
            
        if branches:
            payload["branches"] = branches
        
        # Start the FEL job
        logger.info("Starting FEL job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/fel-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start FEL job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "FEL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "pvalue": pvalue,
                "branches": branches
            }
        }
    except Exception as e:
        logger.error(f"Error starting FEL job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_meme_job(alignment_file: str, tree_file: Optional[str] = None, branches: Optional[str] = None, pvalue: float = 0.1) -> Dict[str, Any]:
    """Start a MEME (Mixed Effects Model of Evolution) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        tree_file: Optional path to the tree file
        branches: Optional branches to test (comma-separated list or 'All')
        pvalue: P-value threshold for significance (default: 0.1)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file if provided
        tree_handle = None
        if tree_file:
            tree_handle = upload_file_to_datamonkey(tree_file)
            if "error" in tree_handle:
                return tree_handle
        
        # Prepare the payload for the MEME job
        payload = {
            "alignment": alignment_handle["handle"],
            "pvalue": pvalue
        }
        
        if tree_handle:
            payload["tree"] = tree_handle["handle"]
            
        if branches:
            payload["branches"] = branches
        
        # Start the MEME job
        logger.info("Starting MEME job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/meme-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start MEME job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "MEME analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "pvalue": pvalue,
                "branches": branches
            }
        }
    except Exception as e:
        logger.error(f"Error starting MEME job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def fetch_datamonkey_job_results(job_id: str, save_to: Optional[str] = None) -> Dict[str, Any]:
    """Fetch the results of a completed job from the Datamonkey API
    
    Args:
        job_id: The ID of the job to fetch results for
        save_to: Optional path to save the results to a JSON file
        
    Returns:
        The job results or an error message
    """
    try:
        ensure_datamonkey_api_connection()
        
        # First check if the job is completed
        status_response = requests.get(f"{get_api_url()}/jobs/{job_id}")
        status_response.raise_for_status()
        job_status = status_response.json()
        
        if job_status["status"] != "completed":
            return {
                "status": "error",
                "error": f"Job {job_id} is not completed. Current status: {job_status['status']}"
            }
        
        # Fetch the results
        results_response = requests.get(f"{get_api_url()}/jobs/{job_id}/results")
        results_response.raise_for_status()
        results = results_response.json()
        
        # Save to file if requested
        if save_to:
            with open(save_to, "w") as f:
                json.dump(results, f, indent=2)
        
        return {
            "status": "success",
            "job_id": job_id,
            "results": results,
            "output_file": save_to if save_to else None
        }
        
    except Exception as e:
        logger.error(f"Error fetching job results from Datamonkey API: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def get_available_methods() -> Dict[str, Any]:
    """Get a list of available HyPhy analysis methods supported by the Datamonkey API
    
    Returns:
        A list of available methods and their descriptions
    """
    # Check if Datamonkey API is reachable
    ensure_datamonkey_api_connection()
    
    methods = [
        {
            "name": "BUSTED",
            "full_name": "Branch-Site Unrestricted Statistical Test for Episodic Diversification",
            "description": "Tests for evidence of episodic positive selection on a subset of branches"
        },
        {
            "name": "FEL",
            "full_name": "Fixed Effects Likelihood",
            "description": "Detects sites under selection by estimating nonsynonymous and synonymous substitution rates at each site"
        },
        {
            "name": "MEME",
            "full_name": "Mixed Effects Model of Evolution",
            "description": "Detects sites under episodic selection by allowing the nonsynonymous rate to vary across lineages at individual sites"
        }
    ]
    
    return {
        "methods": methods
    }


if __name__ == "__main__":
    mcp.run()
