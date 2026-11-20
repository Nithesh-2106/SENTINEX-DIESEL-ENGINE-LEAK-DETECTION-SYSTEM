"""Multi-label neural network architecture for leak detection."""

import torch
import torch.nn as nn


class MultiLabelLeakNN(nn.Module):
    """
    Multi-label neural network for diesel engine leak detection.

    Architecture:
      Input:  42 sensor features (StandardScaler applied)
      Hidden: 256 → 128 → 64
      Output: 7 sigmoid heads (one per scenario)

    Each output is independent P(leak_i present).
    Loss: BCELoss (Binary Cross Entropy per label).
    """

    def __init__(self, input_dim: int = 42, hidden_dims=None, num_labels: int = 7):
        super().__init__()
        if hidden_dims is None:
            hidden_dims = [256, 128, 64]

        layers = []
        in_dim = input_dim

        for h_dim in hidden_dims:
            layers.extend([
                nn.Linear(in_dim, h_dim),
                nn.BatchNorm1d(h_dim),
                nn.ReLU(),
                nn.Dropout(0.3 if h_dim == 256 else 0.2),
            ])
            in_dim = h_dim

        layers.append(nn.Linear(in_dim, num_labels))
        self.network = nn.Sequential(*layers)

    def forward(self, x):
        logits = self.network(x)
        return torch.sigmoid(logits)
