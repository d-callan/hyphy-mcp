# HyPhy MCP Server
import json
import logging
import os
import subprocess
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
mcp = FastMCP("HyPhy", dependencies=["biopython"], timeout=1200)

# HyPhy state
hyphy_state: Dict[str, Any] = {
    "hyphy_path": os.environ.get("HYPHY_PATH", "/usr/local/bin/hyphy"),
    "temp_dir": None,
    "last_results": {},
    "jobs": {},  # Store background jobs
}


def ensure_hyphy_installed():
    """Helper function to ensure HyPhy is installed and accessible"""
    if not os.path.isfile(hyphy_state["hyphy_path"]):
        raise ValueError(
            f"HyPhy not found at {hyphy_state['hyphy_path']}. "
            f"Please install HyPhy or set the HYPHY_PATH environment variable."
        )


def run_hyphy_method_sync(method: str, alignment_file: str, tree_file: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """Run a HyPhy analysis method synchronously
    
    Args:
        method: HyPhy method to run (BUSTED, FEL, MEME, etc.)
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional for some methods)
        **kwargs: Additional method-specific parameters
        
    Returns:
        Dictionary containing analysis results and metadata
    """
    ensure_hyphy_installed()
    
    # Create a temporary directory for output files if not already created
    if hyphy_state["temp_dir"] is None:
        hyphy_state["temp_dir"] = tempfile.mkdtemp(prefix="hyphy_mcp_")
    
    # Create a unique output JSON file for this analysis
    output_file = os.path.join(hyphy_state["temp_dir"], f"{method}_{os.path.basename(alignment_file)}.json")
    
    # Build the HyPhy command based on the method
    cmd = [hyphy_state["hyphy_path"]]
    
    if method == "BUSTED":
        cmd.extend(["busted", 
                   "--alignment", alignment_file,
                   "--tree", tree_file or "",
                   "--output", output_file])
        # Add optional parameters
        if kwargs.get("branches"):
            cmd.extend(["--branches", kwargs["branches"]])
    
    elif method == "FEL":
        cmd.extend(["fel", 
                   "--alignment", alignment_file,
                   "--tree", tree_file or "",
                   "--output", output_file])
        # Add optional parameters
        if kwargs.get("pvalue"):
            cmd.extend(["--pvalue", str(kwargs["pvalue"])])
    
    elif method == "MEME":
        cmd.extend(["meme", 
                   "--alignment", alignment_file,
                   "--tree", tree_file or "",
                   "--output", output_file])
        # Add optional parameters
        if kwargs.get("pvalue"):
            cmd.extend(["--pvalue", str(kwargs["pvalue"])])
    
    else:
        raise ValueError(f"Unsupported HyPhy method: {method}")
    
    # Run the HyPhy command
    logger.info(f"Running HyPhy command: {' '.join(cmd)}")
    process = subprocess.run(cmd, capture_output=True, text=True)
    
    if process.returncode != 0:
        logger.error(f"HyPhy error: {process.stderr}")
        raise RuntimeError(f"HyPhy {method} analysis failed: {process.stderr}")
    
    # Read the results from the output file
    try:
        with open(output_file, 'r') as f:
            results = json.load(f)
            
        # Store the results for later reference
        hyphy_state["last_results"][method] = results
        
        return {
            "status": "success",
            "method": method,
            "results": results,
            "output_file": output_file
        }
    except Exception as e:
        logger.error(f"Error parsing HyPhy results: {e}")
        raise RuntimeError(f"Failed to parse HyPhy {method} results: {str(e)}")


def run_hyphy_method_async(method: str, alignment_file: str, tree_file: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """Run a HyPhy analysis method asynchronously
    
    Args:
        method: HyPhy method to run (BUSTED, FEL, MEME, etc.)
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional for some methods)
        **kwargs: Additional method-specific parameters
        
    Returns:
        Dictionary containing job ID and status information
    """
    ensure_hyphy_installed()
    
    # Create a temporary directory for output files if not already created
    if hyphy_state["temp_dir"] is None:
        hyphy_state["temp_dir"] = tempfile.mkdtemp(prefix="hyphy_mcp_")
    
    # Create a unique output JSON file for this analysis
    output_file = os.path.join(hyphy_state["temp_dir"], f"{method}_{os.path.basename(alignment_file)}.json")
    
    # Build the HyPhy command based on the method
    cmd = [hyphy_state["hyphy_path"]]
    
    if method == "BUSTED":
        cmd.extend(["busted", 
                   "--alignment", alignment_file,
                   "--tree", tree_file or "",
                   "--output", output_file])
        # Add optional parameters
        if kwargs.get("branches"):
            cmd.extend(["--branches", kwargs["branches"]])
    
    elif method == "FEL":
        cmd.extend(["fel", 
                   "--alignment", alignment_file,
                   "--tree", tree_file or "",
                   "--output", output_file])
        # Add optional parameters
        if kwargs.get("pvalue"):
            cmd.extend(["--pvalue", str(kwargs["pvalue"])])
    
    elif method == "MEME":
        cmd.extend(["meme", 
                   "--alignment", alignment_file,
                   "--tree", tree_file or "",
                   "--output", output_file])
        # Add optional parameters
        if kwargs.get("pvalue"):
            cmd.extend(["--pvalue", str(kwargs["pvalue"])])
    
    else:
        raise ValueError(f"Unsupported HyPhy method: {method}")
    
    # Generate a unique job ID
    job_id = str(uuid.uuid4())
    
    # Create job metadata
    job_info = {
        "id": job_id,
        "method": method,
        "status": "running",
        "command": cmd,
        "output_file": output_file,
        "start_time": time.time(),
        "alignment_file": alignment_file,
        "tree_file": tree_file,
        "kwargs": kwargs,
        "results": None,
        "error": None
    }
    
    # Store the job in the state
    hyphy_state["jobs"][job_id] = job_info
    
    # Define the worker function that will run in a separate thread
    def worker():
        try:
            logger.info(f"Running HyPhy command in background: {' '.join(cmd)}")
            process = subprocess.run(cmd, capture_output=True, text=True)
            
            if process.returncode != 0:
                error_msg = f"HyPhy {method} analysis failed: {process.stderr}"
                logger.error(f"HyPhy error: {process.stderr}")
                hyphy_state["jobs"][job_id]["status"] = "failed"
                hyphy_state["jobs"][job_id]["error"] = error_msg
                return
            
            # Read the results from the output file
            try:
                with open(output_file, 'r') as f:
                    results = json.load(f)
                    
                # Store the results
                hyphy_state["jobs"][job_id]["status"] = "completed"
                hyphy_state["jobs"][job_id]["results"] = results
                hyphy_state["last_results"][method] = results
                
            except Exception as e:
                error_msg = f"Failed to parse HyPhy {method} results: {str(e)}"
                logger.error(f"Error parsing HyPhy results: {e}")
                hyphy_state["jobs"][job_id]["status"] = "failed"
                hyphy_state["jobs"][job_id]["error"] = error_msg
                
        except Exception as e:
            error_msg = f"Unexpected error in HyPhy {method} job: {str(e)}"
            logger.error(error_msg)
            hyphy_state["jobs"][job_id]["status"] = "failed"
            hyphy_state["jobs"][job_id]["error"] = error_msg
    
    # Start the worker thread
    thread = threading.Thread(target=worker)
    thread.daemon = True  # Make the thread a daemon so it doesn't block program exit
    thread.start()
    
    # Return the job information
    return {
        "status": "accepted",
        "job_id": job_id,
        "method": method,
        "message": f"HyPhy {method} analysis started in the background"
    }


def run_hyphy_method(method: str, alignment_file: str, tree_file: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """Run a HyPhy analysis method on the provided alignment and tree files
    
    All HyPhy methods run asynchronously in the background to avoid timeout issues.
    
    Args:
        method: HyPhy method to run (BUSTED, FEL, MEME, etc.)
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional for some methods)
        **kwargs: Additional method-specific parameters
        
    Returns:
        Dictionary containing job information
    """
    # All HyPhy methods should run asynchronously to avoid timeout issues
    return run_hyphy_method_async(method, alignment_file, tree_file, **kwargs)


@mcp.tool()
def check_hyphy_installation() -> Dict[str, Any]:
    """Check if HyPhy is installed and accessible
    
    Returns:
        Information about the HyPhy installation
    """
    try:
        ensure_hyphy_installed()
        
        # Get HyPhy version
        cmd = [hyphy_state["hyphy_path"], "--version"]
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        if process.returncode == 0:
            version = process.stdout.strip()
            return {
                "installed": True,
                "path": hyphy_state["hyphy_path"],
                "version": version
            }
        else:
            return {
                "installed": True,
                "path": hyphy_state["hyphy_path"],
                "version": "Unknown (could not determine version)",
                "error": process.stderr.strip()
            }
    except Exception as e:
        return {
            "installed": False,
            "error": str(e)
        }


@mcp.tool()
def run_busted(alignment_file: str, tree_file: Optional[str] = None, branches: Optional[str] = None) -> Dict[str, Any]:
    """Run BUSTED (Branch-Site Unrestricted Statistical Test for Episodic Diversification)
    
    BUSTED is a method to test for evidence of episodic positive selection on a subset of branches.
    This analysis will run in the background.
    
    Args:
        alignment_file: Path to the alignment file in FASTA format
        tree_file: Path to the tree file in Newick format (optional)
        branches: Branches to test for selection (optional, comma-separated list)
        
    Returns:
        Job information for the BUSTED analysis
    """
    try:
        kwargs = {}
        if branches:
            kwargs["branches"] = branches
            
        job_info = run_hyphy_method("BUSTED", alignment_file, tree_file, **kwargs)
        
        # Since all methods now run asynchronously, return the job information
        return {
            "status": "accepted",
            "job_id": job_info["job_id"],
            "message": "BUSTED analysis started in the background. Use check_job_status to monitor progress.",
            "input": {
                "file": alignment_file,
                "tree": tree_file,
                "branches_tested": branches or "All"
            }
        }
    except Exception as e:
        logger.error(f"Error running BUSTED: {e}")
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
def check_job_status(job_id: str) -> Dict[str, Any]:
    """Check the status of a background HyPhy analysis job
    
    Args:
        job_id: The ID of the job to check
        
    Returns:
        Information about the job status and results if completed
    """
    if job_id not in hyphy_state["jobs"]:
        return {
            "status": "error",
            "error": f"Job with ID {job_id} not found"
        }
    
    job_info = hyphy_state["jobs"][job_id]
    status = job_info["status"]
    method = job_info["method"]
    
    # Basic response with status information
    response = {
        "status": status,
        "job_id": job_id,
        "method": method,
        "elapsed_time": time.time() - job_info["start_time"]
    }
    
    # If the job failed, include the error message
    if status == "failed":
        response["error"] = job_info["error"]
        return response
    
    # If the job is still running, just return the status
    if status == "running":
        return response
        # If the job completed successfully, include the results
    if status == "completed":
        # Process the results based on the method
        if method == "BUSTED":
            busted_results = job_info["results"]
            branches = job_info["kwargs"].get("branches")
            
            summary = {
                "test_results": {
                    "p_value": busted_results.get("test results", {}).get("p-value"),
                    "evidence_for_selection": busted_results.get("test results", {}).get("p-value", 1) < 0.05
                },
                "input": {
                    "file": job_info["alignment_file"],
                    "tree": job_info["tree_file"],
                    "branches_tested": branches or "All"
                },
                "output_file": job_info["output_file"]
            }
            
            response["summary"] = summary
            response["full_results"] = busted_results
            
        elif method == "FEL":
            fel_results = job_info["results"]
            pvalue = job_info["kwargs"].get("pvalue", 0.1)
            
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
                    "file": job_info["alignment_file"],
                    "tree": job_info["tree_file"],
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
            
            response["summary"] = summary
            response["full_results"] = fel_results
            
        elif method == "MEME":
            meme_results = job_info["results"]
            pvalue = job_info["kwargs"].get("pvalue", 0.1)
            
            # Count sites under episodic selection
            selected_sites = []
            
            if "MLE" in meme_results:
                for site, data in meme_results["MLE"].items():
                    if isinstance(data, dict) and "p-value" in data:
                        if data["p-value"] <= pvalue:
                            selected_sites.append(int(site))
            
            summary = {
                "input": {
                    "file": job_info["alignment_file"],
                    "tree": job_info["tree_file"],
                    "pvalue": pvalue
                },
                "results": {
                    "episodic_selection_sites": selected_sites,
                    "total_sites_under_selection": len(selected_sites)
                },
                "output_file": job_info["output_file"]
            }
            
            response["summary"] = summary
            response["full_results"] = meme_results
        
        # For other methods, just include the raw results
        else:
            response["results"] = job_info["results"]
        
        return response
    
    # Shouldn't get here, but just in case
    return response


@mcp.tool()
def get_available_methods() -> Dict[str, Any]:
    """Get a list of available HyPhy analysis methods
    
    Returns:
        List of available HyPhy methods with descriptions
    """
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
