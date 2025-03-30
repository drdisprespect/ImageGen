package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"image-generator-backend/handlers"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"sync"
	"time"

	// "backend/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

var (
	currentCmd *exec.Cmd
	cmdMutex   sync.Mutex
)

type Request struct {
	Prompt string `json:"prompt"`
	Model  string `json:"model"`
}

func generateImage(c *gin.Context) {
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Cancel any existing generation.
	cmdMutex.Lock()
	if currentCmd != nil {
		currentCmd.Process.Kill()
		currentCmd = nil
	}
	cmdMutex.Unlock()

	// Gallery folder path (relative to backend folder)
	galleryFolder := "../scripts/gallery"
	os.MkdirAll(galleryFolder, os.ModePerm)

	// Handle DALL·E separately.
	if req.Model == "dalle" {
		imageUrl, err := generateDalleImage(req.Prompt, galleryFolder)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		fmt.Println("DALL·E generated and saved URL:", imageUrl)
		c.JSON(http.StatusOK, gin.H{"imageUrl": imageUrl})
		return
	}

	// For local models, choose progress and output paths.
	var progressFile, outputFile string
	switch req.Model {
	case "model1":
		progressFile = "../scripts/progress_model1.txt"
		outputFile = "output_model1.png" // local filename since we set cmd.Dir below
	case "model2":
		progressFile = "../scripts/progress_model2.txt"
		outputFile = "output_model2.png"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid model"})
		return
	}

	// Remove any existing progress file.
	os.Remove(progressFile)

	// Build command for the Python script.
	var cmd *exec.Cmd
	switch req.Model {
	case "model1":
		cmd = exec.Command("python3", "model1_script.py", "--prompt", req.Prompt)
	case "model2":
		cmd = exec.Command("python3", "model2_script.py", "--prompt", req.Prompt)
	}
	// Set working directory so that relative paths resolve correctly.
	cmd.Dir = "../scripts"

	cmdMutex.Lock()
	currentCmd = cmd
	cmdMutex.Unlock()

	outputBytes, err := cmd.CombinedOutput()
	cmdMutex.Lock()
	currentCmd = nil
	cmdMutex.Unlock()

	if err != nil {
		// Log the Python script's output for debugging.
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Python script error: " + string(outputBytes)})
		return
	}

	// Increase the timeout to allow more time for the output file to be created.
	outputFilePath := filepath.Join(cmd.Dir, outputFile)
	timeout := time.Now().Add(500 * time.Second)
	for {
		if _, err := os.Stat(outputFilePath); err == nil {
			break
		}
		if time.Now().After(timeout) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "output file not created in time"})
			return
		}
		time.Sleep(500 * time.Millisecond)
	}

	// After successful generation, copy the output file to gallery with a unique name.
	timestamp := time.Now().UnixNano()
	var galleryFile string
	switch req.Model {
	case "model1":
		galleryFile = filepath.Join(galleryFolder, fmt.Sprintf("model1_%d.png", timestamp))
	case "model2":
		galleryFile = filepath.Join(galleryFolder, fmt.Sprintf("model2_%d.png", timestamp))
	}

	err = copyFile(outputFilePath, galleryFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to copy file to gallery: " + err.Error()})
		return
	}
	// Return the immediate output file URL (served via /images)
	// Return the unique gallery file URL so that the latest generated image is displayed.
	returnedURL := fmt.Sprintf("/images/gallery/%s?ts=%d", filepath.Base(galleryFile), time.Now().UnixNano())
	c.JSON(http.StatusOK, gin.H{"imageUrl": returnedURL})
}

// copyFile copies a file from src to dst.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func getProgress(c *gin.Context) {
	model := c.Query("model")
	var progressFile string
	switch model {
	case "model1":
		progressFile = "../scripts/progress_model1.txt"
	case "model2":
		progressFile = "../scripts/progress_model2.txt"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid model"})
		return
	}

	// Check if the progress file exists; if not, create it with default progress.
	if _, err := os.Stat(progressFile); os.IsNotExist(err) {
		defaultContent := []byte(`{"progress":0,"eta":0}`)
		if err := ioutil.WriteFile(progressFile, defaultContent, 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create progress file: " + err.Error()})
			return
		}
	}

	data, err := ioutil.ReadFile(progressFile)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"progress": 0, "eta": 0})
		return
	}
	
	var progressData map[string]interface{}
	json.Unmarshal(data, &progressData)
	c.JSON(http.StatusOK, progressData)
}

func cancelGeneration(c *gin.Context) {
    cmdMutex.Lock()
    if currentCmd == nil {
        cmdMutex.Unlock()
        c.JSON(http.StatusOK, gin.H{"message": "No generation in progress"})
        return
    }
    proc := currentCmd.Process
    // Clear currentCmd immediately so that new requests don't conflict.
    currentCmd = nil
    cmdMutex.Unlock()

    // Attempt to kill the process.
    if err := proc.Kill(); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to cancel generation", "error": err.Error()})
        return
    }

    // Wait for the process to exit in a separate goroutine,
    // so that the HTTP handler can return immediately.
    go func() {
        proc.Wait()
    }()

    c.JSON(http.StatusOK, gin.H{"message": "Generation cancelled"})
}


// generateDalleImage calls the OpenAI API, downloads the returned image, and saves it to gallery.
func generateDalleImage(prompt string, galleryFolder string) (string, error) {
	apiKey := "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"
	if apiKey == "" {
		return "", errors.New("missing OpenAI API key")
	}

	reqBody, err := json.Marshal(map[string]interface{}{
		"prompt": prompt,
		"n":      1,
		"size":   "1024x1024",
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/images/generations", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		fmt.Printf("OpenAI API error: status %d, body: %s\n", resp.StatusCode, string(body))
		return "", fmt.Errorf("non-200 response: %d, body: %s", resp.StatusCode, string(body))
	}
	

	var dalleResp struct {
		Data []struct {
			Url string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &dalleResp); err != nil {
		return "", err
	}
	if len(dalleResp.Data) == 0 {
		return "", errors.New("no image generated")
	}
	remoteUrl := dalleResp.Data[0].Url

	// Download the image
	respImg, err := http.Get(remoteUrl)
	if err != nil {
		return "", err
	}
	defer respImg.Body.Close()

	// Create unique filename in gallery.
	timestamp := time.Now().UnixNano()
	galleryFile := filepath.Join(galleryFolder, fmt.Sprintf("dalle_%d.png", timestamp))
	out, err := os.Create(galleryFile)
	if err != nil {
		return "", err
	}
	defer out.Close()
	_, err = io.Copy(out, respImg.Body)
	if err != nil {
		return "", err
	}

	// Return the relative URL for the saved image.
	return "/images/gallery/" + filepath.Base(galleryFile), nil
}

// getGallery lists all image files from the gallery folder.
func getGallery(c *gin.Context) {
	galleryFolder := "../scripts/gallery"
	files, err := ioutil.ReadDir(galleryFolder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var images []string
	for _, file := range files {
		if !file.IsDir() {
			images = append(images, "http://localhost:8080/images/gallery/"+file.Name())

		}
	}
	// Sort images (for example, newest first)
	sort.Slice(images, func(i, j int) bool {
		return images[i] > images[j]
	})
	c.JSON(http.StatusOK, gin.H{"images": images})
}

func main() {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept"},
	}))

	// Serve static files from the scripts folder.
	r.Static("/images", "../scripts")

	r.POST("/generate", generateImage)
	r.GET("/progress", getProgress)
	r.POST("/cancel", cancelGeneration)
	r.GET("/gallery", getGallery)
	r.POST("/api/gemini", handlers.GeminiHandler)
	r.Run(":8080")

}