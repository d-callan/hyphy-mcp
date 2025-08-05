# HyPhy MCP Server
import json
import logging
import os
import time
import tempfile
import requests
import threading
import uuid
from typing import Dict, Any, Optional, List
from mcp.server.fastmcp import FastMCP

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create an MCP server
mcp = FastMCP("HyPhy", dependencies=["biopython", "requests"])

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
def start_absrel_job(alignment_file: str, tree_file: str, branches: Optional[str] = None, 
                    srv: str = "Yes", multiple_hits: str = "None", genetic_code: str = "Universal") -> Dict[str, Any]:
    """Start an ABSREL (Adaptive Branch-Site Random Effects Likelihood) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        tree_file: Path to the tree file (required for ABSREL)
        branches: Optional branches to test (comma-separated list)
        srv: Include synonymous rate variation in the model ("Yes" or "No", default: "Yes")
        multiple_hits: Specify handling of multiple nucleotide substitutions ("None", "Double", or "Double+Triple", default: "None")
        genetic_code: Genetic code to use (default: "Universal")
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file (required for ABSREL)
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "srv": srv,
            "multiple_hits": multiple_hits,
            "genetic_code": genetic_code
        }
        
        # Add branches if specified
        if branches:
            payload["branches"] = branches.split(",")
        
        # Send the request to start the job
        logger.info("Starting ABSREL job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/absrel-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start ABSREL job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "ABSREL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "branches": branches,
                "srv": srv,
                "multiple_hits": multiple_hits,
                "genetic_code": genetic_code
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting ABSREL job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_bgm_job(alignment_file: str, tree_file: str, data_type: str = "codon", 
                 genetic_code: str = "Universal", steps: int = 100000, burn_in: int = 10000,
                 samples: int = 100, max_parents: int = 1, min_subs: int = 1) -> Dict[str, Any]:
    """Start a BGM (Bayesian Graphical Model) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        tree_file: Path to the tree file (required for BGM)
        data_type: The type of data being analyzed ("nucleotide", "amino-acid", or "codon", default: "codon")
        genetic_code: Genetic code to use (default: "Universal")
        steps: Number of MCMC steps to sample (default: 100000)
        burn_in: Number of MCMC steps to discard as burn-in (default: 10000)
        samples: Number of samples to extract from the chain (default: 100)
        max_parents: Maximum number of parents allowed per node (default: 1)
        min_subs: Minimum number of substitutions per site to include in the analysis (default: 1)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file (required for BGM)
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "data_type": data_type,
            "genetic_code": genetic_code,
            "steps": steps,
            "burn_in": burn_in,
            "samples": samples,
            "max_parents": max_parents,
            "min_subs": min_subs
        }
        
        # Send the request to start the job
        logger.info("Starting BGM job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/bgm-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start BGM job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "BGM analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "data_type": data_type,
                "genetic_code": genetic_code,
                "steps": steps,
                "burn_in": burn_in,
                "samples": samples,
                "max_parents": max_parents,
                "min_subs": min_subs
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting BGM job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_contrast_fel_job(alignment_file: str, tree_file: str, branch_sets: str,
                          genetic_code: str = "Universal", srv: str = "Yes", 
                          permutations: str = "Yes", p_value: float = 0.05, 
                          q_value: float = 0.20) -> Dict[str, Any]:
    """Start a CONTRAST-FEL (Contrast Fixed Effects Likelihood) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        tree_file: Path to the tree file
        branch_sets: Branch sets to be used for comparison (comma-separated list, e.g., "Set1,Set2")
        genetic_code: Genetic code to use (default: "Universal")
        srv: Include synonymous rate variation in the model ("Yes" or "No", default: "Yes")
        permutations: Perform permutation significance tests ("Yes" or "No", default: "Yes")
        p_value: Significance value for site tests (default: 0.05)
        q_value: Significance value for False Discovery Rate reporting (default: 0.20)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "branch_sets": branch_sets.split(","),
            "genetic_code": genetic_code,
            "srv": srv,
            "permutations": permutations,
            "p_value": p_value,
            "q_value": q_value
        }
        
        # Send the request to start the job
        logger.info("Starting CONTRAST-FEL job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/contrast-fel-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start CONTRAST-FEL job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "CONTRAST-FEL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "branch_sets": branch_sets,
                "genetic_code": genetic_code,
                "srv": srv,
                "permutations": permutations,
                "p_value": p_value,
                "q_value": q_value
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting CONTRAST-FEL job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_fade_job(alignment_file: str, tree_file: str, bayes_factor_threshold: int = 100) -> Dict[str, Any]:
    """Start a FADE (FUBAR Approach to Directional Evolution) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the protein sequence alignment file
        tree_file: Path to the rooted phylogenetic tree file
        bayes_factor_threshold: Bayes Factor threshold for determining significant sites (default: 100)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "bayes_factor_threshold": bayes_factor_threshold
        }
        
        # Send the request to start the job
        logger.info("Starting FADE job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/fade-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start FADE job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "FADE analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "bayes_factor_threshold": bayes_factor_threshold
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting FADE job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_fubar_job(alignment_file: str, tree_file: str, genetic_code: str = "Universal",
                   grid_points: int = 20, concentration_parameter: float = 0.5) -> Dict[str, Any]:
    """Start a FUBAR (Fast Unconstrained Bayesian AppRoximation) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the in-frame codon alignment file
        tree_file: Path to the phylogenetic tree file
        genetic_code: Genetic code to use (default: "Universal")
        grid_points: Number of grid points for the Bayesian analysis (5-50, default: 20)
        concentration_parameter: Concentration parameter for the Dirichlet prior (0.001-1, default: 0.5)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Validate parameters
        if grid_points < 5 or grid_points > 50:
            return {
                "status": "error",
                "error": "Grid points must be between 5 and 50"
            }
            
        if concentration_parameter < 0.001 or concentration_parameter > 1:
            return {
                "status": "error",
                "error": "Concentration parameter must be between 0.001 and 1"
            }
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "genetic_code": genetic_code,
            "grid_points": grid_points,
            "concentration_parameter": concentration_parameter
        }
        
        # Send the request to start the job
        logger.info("Starting FUBAR job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/fubar-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start FUBAR job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "FUBAR analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "genetic_code": genetic_code,
                "grid_points": grid_points,
                "concentration_parameter": concentration_parameter
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting FUBAR job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_gard_job(alignment_file: str, genetic_code: str = "Universal", data_type: str = "Nucleotide",
                  run_mode: str = "Normal", site_to_site_variation: str = "None", 
                  rate_classes: int = 2, model: str = "JTT") -> Dict[str, Any]:
    """Start a GARD (Genetic Algorithm for Recombination Detection) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        genetic_code: Genetic code to use (default: "Universal")
        data_type: The type of data being analyzed ("Nucleotide" or "Protein", default: "Nucleotide")
        run_mode: The optimization mode ("Normal" or "Faster", default: "Normal")
        site_to_site_variation: Model for rate variation among sites ("None", "General Discrete", or "Beta-Gamma", default: "None")
        rate_classes: Number of discrete rate classes for rate variation (default: 2)
        model: The substitution model to use (default: "JTT")
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "genetic_code": genetic_code,
            "data_type": data_type,
            "run_mode": run_mode,
            "site_to_site_variation": site_to_site_variation,
            "rate_classes": rate_classes,
            "model": model
        }
        
        # Send the request to start the job
        logger.info("Starting GARD job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/gard-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start GARD job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "GARD analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "genetic_code": genetic_code,
                "data_type": data_type,
                "run_mode": run_mode,
                "site_to_site_variation": site_to_site_variation,
                "rate_classes": rate_classes,
                "model": model
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting GARD job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_multihit_job(alignment_file: str, genetic_code: str = "Universal", 
                      triple_islands: str = "No", rate_classes: int = 3) -> Dict[str, Any]:
    """Start a MULTIHIT (Multi-Hit Model) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        genetic_code: Genetic code to use (default: "Universal")
        triple_islands: Toggle for accounting synonymous triple-hit substitutions ("Yes" or "No", default: "No")
        rate_classes: Number of rate classes to use (1-10, default: 3)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Validate parameters
        if rate_classes < 1 or rate_classes > 10:
            return {
                "status": "error",
                "error": "Rate classes must be between 1 and 10"
            }
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "genetic_code": genetic_code,
            "triple_islands": triple_islands,
            "rate_classes": rate_classes
        }
        
        # Send the request to start the job
        logger.info("Starting MULTIHIT job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/multihit-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start MULTIHIT job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "MULTIHIT analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "genetic_code": genetic_code,
                "triple_islands": triple_islands,
                "rate_classes": rate_classes
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting MULTIHIT job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_nrm_job(alignment_file: str, tree_file: str, genetic_code: str = "Universal",
                 save_fit: bool = False) -> Dict[str, Any]:
    """Start a NRM (Nucleotide Rate Matrix) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the nucleotide sequence alignment file
        tree_file: Path to the rooted phylogenetic tree file
        genetic_code: Genetic code to use (default: "Universal")
        save_fit: Save NRM+F model fit to a file (default: False)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "genetic_code": genetic_code,
            "save_fit": save_fit
        }
        
        # Send the request to start the job
        logger.info("Starting NRM job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/nrm-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start NRM job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "NRM analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "genetic_code": genetic_code,
                "save_fit": save_fit
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting NRM job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_relax_job(alignment_file: str, tree_file: str, genetic_code: str = "Universal",
                   test_branches: List[str] = None, reference_branches: List[str] = None,
                   models: str = "All", rates: int = 3, kill_zero_lengths: str = "No") -> Dict[str, Any]:
    """Start a RELAX (Relaxation Test) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        tree_file: Path to the tree file
        genetic_code: Genetic code to use (default: "Universal")
        test_branches: Branches to be considered as 'Test' (default: [])
        reference_branches: Branches to be considered as 'Reference' (default: [])
        models: Type of analysis to run ("All" or "Minimal", default: "All")
        rates: Number of omega rate classes (default: 3)
        kill_zero_lengths: Specify whether to handle zero-length branches ("Yes" or "No", default: "No")
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Initialize empty lists if None
        if test_branches is None:
            test_branches = []
        if reference_branches is None:
            reference_branches = []
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "genetic_code": genetic_code,
            "test_branches": test_branches,
            "reference_branches": reference_branches,
            "models": models,
            "rates": rates,
            "kill_zero_lengths": kill_zero_lengths
        }
        
        # Send the request to start the job
        logger.info("Starting RELAX job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/relax-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start RELAX job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "RELAX analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "genetic_code": genetic_code,
                "test_branches": test_branches,
                "reference_branches": reference_branches,
                "models": models,
                "rates": rates,
                "kill_zero_lengths": kill_zero_lengths
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting RELAX job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_slac_job(alignment_file: str, tree_file: str, genetic_code: str = "Universal",
                  branches: str = "All", samples: int = 100, pvalue: float = 0.1) -> Dict[str, Any]:
    """Start a SLAC (Single Likelihood Ancestor Counting) analysis job on the Datamonkey API
    
    Args:
        alignment_file: Path to the alignment file
        tree_file: Path to the tree file
        genetic_code: Genetic code to use (default: "Universal")
        branches: Specify branches to test (default: "All")
        samples: Number of samples for ancestral reconstruction uncertainty (default: 100)
        pvalue: Threshold for statistical significance (0-1, default: 0.1)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Validate parameters
        if samples < 1:
            return {
                "status": "error",
                "error": "Samples must be at least 1"
            }
            
        if pvalue < 0 or pvalue > 1:
            return {
                "status": "error",
                "error": "P-value must be between 0 and 1"
            }
        
        # Upload the alignment file
        alignment_handle = upload_file_to_datamonkey(alignment_file)
        if "error" in alignment_handle:
            return alignment_handle
        
        # Upload the tree file
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "alignment": alignment_handle["handle"],
            "tree": tree_handle["handle"],
            "genetic_code": genetic_code,
            "branches": branches,
            "samples": samples,
            "pvalue": pvalue
        }
        
        # Send the request to start the job
        logger.info("Starting SLAC job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/slac-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start SLAC job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "SLAC analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "genetic_code": genetic_code,
                "branches": branches,
                "samples": samples,
                "pvalue": pvalue
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting SLAC job: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@mcp.tool()
def start_slatkin_job(tree_file: str, groups: int = 2, compartment_definitions: List[Dict[str, str]] = None,
                     replicates: int = 1000, weight: float = 0.2, use_bootstrap: bool = True) -> Dict[str, Any]:
    """Start a SLATKIN (Slatkin-Maddison Test) analysis job on the Datamonkey API
    
    Args:
        tree_file: Path to the phylogenetic tree file
        groups: Number of compartments/groups to test (2-100, default: 2)
        compartment_definitions: Array of compartment definitions, each with 'description' and 'regexp' fields
        replicates: Number of bootstrap replicates (1-1000000, default: 1000)
        weight: Probability of branch selection for structured permutation (0-1, default: 0.2)
        use_bootstrap: Whether to use bootstrap weights to respect well-supported clades (default: True)
        
    Returns:
        Information about the started job
    """
    try:
        ensure_datamonkey_api_connection()
        
        # Validate parameters
        if groups < 2 or groups > 100:
            return {
                "status": "error",
                "error": "Groups must be between 2 and 100"
            }
            
        if replicates < 1 or replicates > 1000000:
            return {
                "status": "error",
                "error": "Replicates must be between 1 and 1000000"
            }
            
        if weight < 0 or weight > 1:
            return {
                "status": "error",
                "error": "Weight must be between 0 and 1"
            }
        
        # Initialize empty list if None
        if compartment_definitions is None:
            compartment_definitions = []
            
        # Validate compartment definitions
        for comp in compartment_definitions:
            if "description" not in comp or "regexp" not in comp:
                return {
                    "status": "error",
                    "error": "Each compartment definition must have 'description' and 'regexp' fields"
                }
        
        # Upload the tree file
        tree_handle = upload_file_to_datamonkey(tree_file)
        if "error" in tree_handle:
            return tree_handle
        
        # Prepare the request payload
        payload = {
            "tree": tree_handle["handle"],
            "groups": groups,
            "compartment_definitions": compartment_definitions,
            "replicates": replicates,
            "weight": weight,
            "use_bootstrap": use_bootstrap
        }
        
        # Send the request to start the job
        logger.info("Starting SLATKIN job with Datamonkey API")
        response = requests.post(
            f"{get_api_url()}/methods/slatkin-start", 
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        
        if "job_id" not in job_data:
            return {
                "status": "error",
                "error": "Failed to start SLATKIN job: No job_id in response"
            }
        
        job_id = job_data["job_id"]
        
        return {
            "status": "accepted",
            "job_id": job_id,
            "message": "SLATKIN analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.",
            "input": {
                "tree": tree_file,
                "groups": groups,
                "compartment_definitions": compartment_definitions,
                "replicates": replicates,
                "weight": weight,
                "use_bootstrap": use_bootstrap
            }
        }
        
    except Exception as e:
        logger.error(f"Error starting SLATKIN job: {e}")
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
            "name": "ABSREL",
            "full_name": "Adaptive Branch-Site Random Effects Likelihood",
            "description": "Tests for evidence of episodic diversifying selection on a per-branch basis"
        },
        {
            "name": "BGM",
            "full_name": "Bayesian Graphical Model",
            "description": "Infers patterns of conditional dependence among sites in an alignment"
        },
        {
            "name": "BUSTED",
            "full_name": "Branch-Site Unrestricted Statistical Test for Episodic Diversification",
            "description": "Tests for evidence of episodic positive selection on a subset of branches"
        },
        {
            "name": "CONTRAST-FEL",
            "full_name": "Contrast Fixed Effects Likelihood",
            "description": "Tests for differences in selective pressures between two sets of branches"
        },
        {
            "name": "FADE",
            "full_name": "FUBAR Approach to Directional Evolution",
            "description": "Detects directional selection using a Bayesian approach"
        },
        {
            "name": "FEL",
            "full_name": "Fixed Effects Likelihood",
            "description": "Detects sites under selection by estimating nonsynonymous and synonymous substitution rates at each site"
        },
        {
            "name": "FUBAR",
            "full_name": "Fast Unconstrained Bayesian AppRoximation",
            "description": "Detects sites under selection using a Bayesian approach that is typically faster than FEL"
        },
        {
            "name": "GARD",
            "full_name": "Genetic Algorithm for Recombination Detection",
            "description": "Identifies recombination breakpoints in an alignment"
        },
        {
            "name": "MEME",
            "full_name": "Mixed Effects Model of Evolution",
            "description": "Detects sites under episodic selection by allowing the nonsynonymous rate to vary across lineages at individual sites"
        },
        {
            "name": "MULTIHIT",
            "full_name": "Multi-Hit Model",
            "description": "Fits a codon model that accounts for multiple nucleotide substitutions"
        },
        {
            "name": "NRM",
            "full_name": "Nucleotide Rate Matrix",
            "description": "Estimates a general nucleotide substitution model from data"
        },
        {
            "name": "RELAX",
            "full_name": "Relaxation Test",
            "description": "Tests for relaxation or intensification of selection on a specified set of branches"
        },
        {
            "name": "SLAC",
            "full_name": "Single-Likelihood Ancestor Counting",
            "description": "Counts ancestral mutations to infer selection at individual sites"
        },
        {
            "name": "SLATKIN",
            "full_name": "Slatkin's Exact Test",
            "description": "Tests for neutrality using Slatkin's exact test"
        }
    ]
    
    return {
        "methods": methods
    }


if __name__ == "__main__":
    mcp.run()
